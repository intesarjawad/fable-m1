import { useState, useRef, useCallback, useEffect } from "react";
import {
  BaseItemDto,
  SubtitlePlaybackMode,
} from "@jellyfin/sdk/lib/generated-client/models";
import {
  fetchMediaDetails,
  reportPlaybackStart,
  reportPlaybackProgress,
  reportPlaybackStopped,
  getAuthData,
  getStreamUrl,
  getDirectStreamUrl,
  getSubtitleTracks,
  markFavorite,
  unmarkFavorite,
} from "../../actions";
import { PlaybackState, Player, PlayOptions, PlayerType } from "../types";
import { PlayQueueManager } from "../utils/playQueueManager";
import { v4 as uuidv4 } from "uuid";

export const playQueueManager = new PlayQueueManager();

function convertSubtitleToVTT(content: string): string {
  if (content.includes("WEBVTT")) {
    return content;
  }

  let vtt = "WEBVTT\n\n";

  // Line-by-line parsing — more robust than block splitting.
  // SRT files from different sources have inconsistent blank line spacing.
  const lines = content.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    // Look for a timestamp line anywhere
    if (line.includes("-->")) {
      const vttTimeline = line.replace(/,/g, ".");

      // Collect text lines until blank line or next sequence number
      const textLines: string[] = [];
      i++;
      while (i < lines.length) {
        const textLine = lines[i];
        const trimmed = textLine.trim();
        // Stop at blank lines or lines that look like sequence numbers
        // (a sequence number is a standalone integer followed by a blank or timestamp)
        if (trimmed === "") {
          i++;
          break;
        }
        // Check if this line is a sequence number (all digits) and next line has -->
        if (/^\d+$/.test(trimmed) && i + 1 < lines.length && lines[i + 1].includes("-->")) {
          break;
        }
        textLines.push(textLine);
        i++;
      }

      if (textLines.length > 0) {
        vtt += `${vttTimeline}\n${textLines.join("\n")}\n\n`;
      }
    } else {
      i++;
    }
  }

  return vtt;
}

export interface PlaybackContextValue {
  playbackState: PlaybackState;
  play: (
    items: BaseItemDto | BaseItemDto[],
    options?: PlayOptions,
  ) => Promise<void>;
  pause: () => void;
  unpause: () => void;
  stop: () => void;
  next: () => void;
  previous: () => void;
  seek: (ticks: number) => void;
  setVolume: (volume: number) => void;
  setMute: (mute: boolean) => void;
  toggleMute: () => void;
  toggleFavorite: () => Promise<void>;
  setPlaybackRate: (rate: number) => void;
  setAudioStreamIndex: (index: number) => void;
  setSubtitleStreamIndex: (index: number) => void;
  setSubtitleUrl: (url: string) => Promise<void>;
  registerPlayer: (type: PlayerType, player: Player) => void;
  unregisterPlayer: (type: PlayerType) => void;
  reportState: (updates: Partial<PlaybackState>) => void;
  setPreferredQuality: (quality: string) => void;
  toggleMiniPlayer: () => void;
  setMiniPlayer: (enabled: boolean) => void;
}

export function usePlaybackManager(): PlaybackContextValue {
  const playersRef = useRef<Record<string, Player>>({});

  const [playbackState, setPlaybackState] = useState<PlaybackState>({
    paused: false,
    muted: false,
    volume: 100,
    playbackRate: 1,
    currentTime: 0,
    duration: 0,
    buffered: null,
    isBuffering: false,
    isEnded: false,
    currentMediaSource: null,
    currentItem: null,
    playMethod: null,
    subtitleOffset: 0,
    aspectRatio: "contain",
    repeatMode: "Off",
    preferredQuality: "auto",
    isMiniPlayer: false,
    isLoading: true,
  });

  const activePlayerRef = useRef<Player | null>(null);
  const playSessionIdRef = useRef<string>("");
  const latestStateRef = useRef(playbackState);
  useEffect(() => {
    latestStateRef.current = playbackState;
  }, [playbackState]);

  const updateState = useCallback((updates: Partial<PlaybackState>) => {
    setPlaybackState((prev) => {
      const shouldClearLoading =
        (updates.currentTime !== undefined && updates.currentTime > 0.1) ||
        updates.isBuffering === false ||
        updates.paused === false;

      let nextLoading = prev.isLoading;
      if (shouldClearLoading) {
        nextLoading = false;
      }
      if (updates.isLoading !== undefined) {
        nextLoading = updates.isLoading;
      }

      return { ...prev, ...updates, isLoading: nextLoading };
    });
  }, []);

  const registerPlayer = useCallback((type: PlayerType, player: Player) => {
    playersRef.current[type] = player;
  }, []);

  const unregisterPlayer = useCallback((type: PlayerType) => {
    delete playersRef.current[type];
  }, []);

  const getPlayerForMedia = useCallback((item: BaseItemDto): Player | null => {
    const mediaType = item.MediaType as string;
    if (!mediaType) return null;

    if (
      mediaType === "Video" ||
      mediaType === "Movie" ||
      mediaType === "Episode" ||
      mediaType === "TvChannel"
    ) {
      return playersRef.current["Video"] || null;
    } else if (mediaType === "Audio") {
      return playersRef.current["Audio"] || null;
    }
    return null;
  }, []);

  const play = useCallback(
    async (items: BaseItemDto | BaseItemDto[], options: PlayOptions = {}) => {
      const itemList = Array.isArray(items) ? items : [items];
      if (itemList.length === 0) return;

      playQueueManager.setPlaylist(itemList as any[]);
      playQueueManager.setPlaylistIndex(0);
      let itemToPlay = playQueueManager.getCurrentItem();
      if (!itemToPlay || !itemToPlay.Id) return;

      const player = getPlayerForMedia(itemToPlay);
      if (!player) {
        console.error("No suitable player found for", itemToPlay.MediaType);
        return;
      }

      if (activePlayerRef.current && activePlayerRef.current !== player) {
        activePlayerRef.current.stop(true);
      }
      const hasMediaSources =
        itemToPlay.MediaSources && itemToPlay.MediaSources.length > 0;
      const hasTrickplay = !!(itemToPlay as any).Trickplay;
      const hasProviderIds = !!(itemToPlay as any).ProviderIds;

      if (!hasMediaSources || !hasTrickplay || !hasProviderIds) {
        try {
          const fullItem = await fetchMediaDetails(itemToPlay.Id!);
          if (fullItem) {
            itemToPlay = { ...itemToPlay, ...fullItem } as any;
          }
        } catch (e) {
          console.error("Failed to fetch full media details", e);
        }
      }

      // Determine Media Source
      const mediaSourceId = options.mediaSourceId;
      let mediaSource = itemToPlay!.MediaSources?.find(
        (ms) => ms.Id === mediaSourceId,
      );
      if (
        !mediaSource &&
        itemToPlay!.MediaSources &&
        itemToPlay!.MediaSources.length > 0
      ) {
        mediaSource = itemToPlay!.MediaSources[0];
      }

      const { user } = await getAuthData();

      try {
        if (mediaSource?.Id && itemToPlay!.Id) {
          const subs = await getSubtitleTracks(itemToPlay!.Id!, mediaSource.Id);
          let targetIndex = options.subtitleStreamIndex;

          if (targetIndex === undefined && options.subtitleLanguage) {
            const matchingSub = subs.find(
              (s) => s.language === options.subtitleLanguage,
            );
            if (matchingSub && matchingSub.index !== undefined) {
              targetIndex = matchingSub.index;
              options.subtitleStreamIndex = targetIndex;
            }
          }

          if (targetIndex === undefined) {
            if (user && user.Configuration && user.Configuration.SubtitleMode) {
              let subtitlePreference: (typeof subs)[0] | undefined;
              switch (user.Configuration.SubtitleMode) {
                case SubtitlePlaybackMode.Default:
                  subtitlePreference = subs.find((s) => s.default);
                  if (subtitlePreference) break; //Fallthrough to forced if default is not found.
                case SubtitlePlaybackMode.OnlyForced:
                  subtitlePreference = subs.find((s) => s.forced);
                  break;
                case SubtitlePlaybackMode.Always:
                  if (user.Configuration.SubtitleLanguagePreference)
                    subtitlePreference = subs.find(
                      (s) =>
                        s.language ===
                        user.Configuration!.SubtitleLanguagePreference!,
                    );
                  break;
                case SubtitlePlaybackMode.Smart:
                  const audioLang = mediaSource.MediaStreams?.find(
                    (s) =>
                      s.Type === "Audio" &&
                      s.Index === options.audioStreamIndex,
                  )?.Language;
                  if (
                    audioLang &&
                    user.Configuration.SubtitleLanguagePreference &&
                    audioLang !== user.Configuration.SubtitleLanguagePreference
                  ) {
                    subtitlePreference = subs.find(
                      (s) =>
                        s.language ===
                        user.Configuration!.SubtitleLanguagePreference!,
                    );
                  }
                  break;
                default:
              }
              if (subtitlePreference) {
                targetIndex = subtitlePreference.index;
                options.subtitleStreamIndex = targetIndex;
              }
            }
          }

          // If no subtitle was selected by Jellyfin's mode, default to English
          if (targetIndex === undefined) {
            const englishSub = subs.find(
              (s) => {
                const lang = (s.language || "").toLowerCase();
                return (lang === "eng" || lang === "en" || lang === "english") && !s.forced;
              }
            );
            if (englishSub) {
              targetIndex = englishSub.index;
              options.subtitleStreamIndex = targetIndex;
            }
          }

          if (targetIndex !== undefined) {
            options.textTracks = subs.map((t) => ({
              ...t,
              default: t.index === targetIndex,
            }));
          } else {
            options.textTracks = subs;
          }
          updateState({ textTracks: subs });
        }
      } catch (e) {
        console.error("Failed to load sidecar subtitles", e);
      }

      if (options.audioStreamIndex === undefined && mediaSource?.MediaStreams) {
        if (options.audioLanguage) {
          const matchingAudio = mediaSource.MediaStreams.find(
            (s) => s.Type === "Audio" && s.Language === options.audioLanguage,
          );
          if (matchingAudio && matchingAudio.Index !== undefined) {
            options.audioStreamIndex = matchingAudio.Index;
          }
        }

        if (options.audioStreamIndex === undefined) {
          const audioStreams = mediaSource.MediaStreams.filter(
            (s) => s.Type === "Audio",
          );

          // Prefer English, then default, then alphabetical
          audioStreams.sort((a, b) => {
            const aIsEnglish = (a.Language || "").toLowerCase().startsWith("eng") ||
              (a.Language || "").toLowerCase() === "en";
            const bIsEnglish = (b.Language || "").toLowerCase().startsWith("eng") ||
              (b.Language || "").toLowerCase() === "en";
            if (aIsEnglish && !bIsEnglish) return -1;
            if (!aIsEnglish && bIsEnglish) return 1;

            const defA = a.IsDefault || false;
            const defB = b.IsDefault || false;
            if (defA && !defB) return -1;
            if (!defA && defB) return 1;
            return (a.Language || "").localeCompare(b.Language || "");
          });

          if (audioStreams.length > 0) {
            options.audioStreamIndex = audioStreams[0].Index;
          } else {
            options.audioStreamIndex = 1;
          }
        }
      }

      if (!options.url && mediaSource && mediaSource.Id && itemToPlay!.Id) {
        try {
          let urlSubtitleIndex = options.subtitleStreamIndex;
          if (!options.textTracks && itemToPlay?.Id && mediaSource?.Id) {
            try {
              const tracks = await getSubtitleTracks(
                itemToPlay.Id,
                mediaSource.Id,
              );
              options.textTracks = tracks;
            } catch (e) {
              console.warn("Failed to fetch subtitle tracks for playback", e);
            }
          }

          if (
            options.textTracks &&
            urlSubtitleIndex !== undefined &&
            urlSubtitleIndex !== -1
          ) {
            const hasSidecar = options.textTracks.some(
              (t) => t.index === urlSubtitleIndex,
            );
            if (hasSidecar) {
              urlSubtitleIndex = -1;
            }
          }

          if (urlSubtitleIndex !== undefined && urlSubtitleIndex !== -1) {
            const selectedSub = mediaSource.MediaStreams?.find(
              (s) => s.Type === "Subtitle" && s.Index === urlSubtitleIndex,
            );
            const isTextSub =
              selectedSub &&
              ["subrip", "srt", "ass", "ssa", "vtt"].includes(
                (selectedSub.Codec || "").toLowerCase(),
              );
            if (isTextSub) {
              urlSubtitleIndex = -1;
            }
          }

          const SUPPORTED_CONTAINERS = ["mp4", "m4v", "mov", "webm"];
          const isContainerSupported = SUPPORTED_CONTAINERS.includes(
            (mediaSource.Container || "").toLowerCase(),
          );

          const isDirectPlayCompatible =
            isContainerSupported &&
            (mediaSource.SupportsDirectPlay ||
              (mediaSource.Container === "mp4" &&
                mediaSource.MediaStreams?.some(
                  (s) => s.Type === "Video" && s.Codec === "h264",
                )));

          const isBitrateCompatible =
            !options.videoBitrate ||
            (mediaSource.Bitrate &&
              options.videoBitrate >= mediaSource.Bitrate);

          const selectedAudio = mediaSource.MediaStreams?.find(
            (s) => s.Type === "Audio" && s.Index === options.audioStreamIndex,
          );
          const SUPPORTED_AUDIO_CODECS = [
            "aac",
            "mp3",
            "opus",
            "flac",
            "vorbis",
          ];
          const isAudioCompatible =
            selectedAudio &&
            SUPPORTED_AUDIO_CODECS.includes(
              (selectedAudio.Codec || "").toLowerCase(),
            );

          if (
            isDirectPlayCompatible &&
            urlSubtitleIndex === -1 &&
            isBitrateCompatible &&
            isAudioCompatible
          ) {
            options.url = await getDirectStreamUrl(
              itemToPlay!.Id!,
              mediaSource,
              options.audioStreamIndex,
            );
          } else {
            options.url = await getStreamUrl(
              itemToPlay!.Id!,
              mediaSource.Id,
              undefined,
              options.videoBitrate,
              options.audioStreamIndex,
              urlSubtitleIndex,
            );
          }
        } catch (e) {
          console.error("Failed to generate stream URL", e);
        }
      }

      playSessionIdRef.current = uuidv4();

      activePlayerRef.current = player;
      updateState({
        currentItem: itemToPlay!,
        currentMediaSource: mediaSource || null,
        paused: false,
        isEnded: false,
        currentTime: 0,
        duration: (itemToPlay!.RunTimeTicks || 0) / 10000000,
        subtitleStreamIndex: options.subtitleStreamIndex,
        audioStreamIndex: options.audioStreamIndex,
        isLoading: true,
      });

      if (itemToPlay!.Id && mediaSource && mediaSource.Id) {
        reportPlaybackStart(
          itemToPlay!.Id,
          mediaSource.Id,
          playSessionIdRef.current,
        ).catch((e) => console.error("Failed to report playback start", e));
      }

      try {
        await player.play(itemToPlay!, {
          ...options,
          mediaSource: mediaSource || undefined,
        });
      } catch (err) {
        console.error("Playback failed", err);
      }
    },
    [getPlayerForMedia, updateState],
  );

  const pause = useCallback(() => {
    activePlayerRef.current?.pause();
    updateState({ paused: true });

    const item = latestStateRef.current.currentItem;
    const mediaSource = latestStateRef.current.currentMediaSource;
    const sessionId = playSessionIdRef.current;
    if (item?.Id && mediaSource?.Id && sessionId) {
      reportPlaybackProgress(
        item.Id,
        mediaSource.Id,
        sessionId,
        Math.floor(latestStateRef.current.currentTime * 10000000),
        true,
      ).catch((e) => console.error("Failed to report pause", e));
    }
  }, [updateState]);

  const unpause = useCallback(() => {
    activePlayerRef.current?.unpause();
    updateState({ paused: false });

    const item = latestStateRef.current.currentItem;
    const mediaSource = latestStateRef.current.currentMediaSource;
    const sessionId = playSessionIdRef.current;
    if (item?.Id && mediaSource?.Id && sessionId) {
      reportPlaybackProgress(
        item.Id,
        mediaSource.Id,
        sessionId,
        Math.floor(latestStateRef.current.currentTime * 10000000),
        false,
      ).catch((e) => console.error("Failed to report unpause", e));
    }
  }, [updateState]);

  const stop = useCallback(() => {
    const item = latestStateRef.current.currentItem;
    const mediaSource = latestStateRef.current.currentMediaSource;
    const sessionId = playSessionIdRef.current;
    const ticks = Math.floor(latestStateRef.current.currentTime * 10000000);

    if (item?.Id && mediaSource?.Id && sessionId) {
      reportPlaybackStopped(item.Id, mediaSource.Id, sessionId, ticks).catch(
        (e) => console.error("Failed to report playback stopped", e),
      );
    }

    activePlayerRef.current?.stop(true);
    activePlayerRef.current = null;
    playSessionIdRef.current = "";
    updateState({
      paused: false,
      currentTime: 0,
      currentItem: null,
      isEnded: false,
    });
  }, [updateState]);

  const seek = useCallback(
    (ticks: number) => {
      const player = activePlayerRef.current;
      if (player) {
        player.seek(ticks);
        updateState({ currentTime: ticks / 10000000 });
      }
    },
    [activePlayerRef, updateState],
  );

  const next = useCallback(() => {
    const nextInfo = playQueueManager.getNextItemInfo();
    if (nextInfo) {
      playQueueManager.setPlaylistIndex(nextInfo.index);
      const item = playQueueManager.getCurrentItem();
      if (item) play(item, { startPositionTicks: 0 });
    } else {
      stop();
    }
  }, [play, stop]);

  const previous = useCallback(() => {
    const currentIndex = playQueueManager.getCurrentPlaylistIndex();
    if (currentIndex > 0) {
      playQueueManager.setPlaylistIndex(currentIndex - 1);
      const item = playQueueManager.getCurrentItem();
      if (item) play(item, { startPositionTicks: 0 });
    }
  }, [play]);

  const setVolume = useCallback(
    (volume: number) => {
      activePlayerRef.current?.setVolume(volume);
      updateState({ volume });
    },
    [updateState],
  );

  const setMute = useCallback(
    (mute: boolean) => {
      activePlayerRef.current?.setMute(mute);
      updateState({ muted: mute });
    },
    [updateState],
  );

  const toggleMute = useCallback(() => {
    const newMute = !playbackState.muted;
    setMute(newMute);
  }, [playbackState.muted, setMute]);

  const toggleFavorite = useCallback(async () => {
    const item = playbackState.currentItem;
    if (!item || !item.Id || !item.UserData) return;

    const isFavorite = item.UserData.IsFavorite;
    const newFavoriteState = !isFavorite;

    updateState({
      currentItem: {
        ...item,
        UserData: {
          ...item.UserData,
          IsFavorite: newFavoriteState,
        },
      },
    });

    try {
      if (newFavoriteState) {
        await markFavorite(item.Id);
      } else {
        await unmarkFavorite(item.Id);
      }
    } catch (error) {
      console.error("Failed to toggle favorite", error);
      updateState({
        currentItem: {
          ...item,
          UserData: {
            ...item.UserData,
            IsFavorite: isFavorite,
          },
        },
      });
    }
  }, [playbackState.currentItem, updateState]);

  const setPlaybackRate = useCallback(
    (rate: number) => {
      activePlayerRef.current?.setPlaybackRate(rate);
      updateState({ playbackRate: rate });
    },
    [updateState],
  );

  const setAudioStreamIndex = useCallback(
    (index: number) => {
      const item = playbackState.currentItem;
      if (!item) return;

      const startTicks = Math.floor(playbackState.currentTime * 10000000);

      play(item, {
        mediaSourceId: playbackState.currentMediaSource?.Id || undefined,
        startPositionTicks: startTicks,
        subtitleStreamIndex: playbackState.subtitleStreamIndex,
        audioStreamIndex: index,
      });

      updateState({ audioStreamIndex: index });
    },
    [
      play,
      playbackState.currentItem,
      playbackState.currentMediaSource,
      playbackState.currentTime,
      playbackState.subtitleStreamIndex,
      updateState,
    ],
  );

  const setSubtitleStreamIndex = useCallback(
    async (index: number) => {
      const item = playbackState.currentItem;
      const mediaSourceId = playbackState.currentMediaSource?.Id;

      if (
        item?.Id &&
        mediaSourceId &&
        activePlayerRef.current?.name === "HTML Video Player"
      ) {
        const subs = playbackState.textTracks || [];

        if (index === -1) {
          activePlayerRef.current.setSubtitleStreamIndex(index);
          updateState({ subtitleStreamIndex: index });
          return;
        }

        const targetTrack = subs.find((t) => t.index === index);

        if (targetTrack) {
          activePlayerRef.current.setSubtitleStreamIndex(index);
          updateState({ subtitleStreamIndex: index });
          return;
        }

        try {
          const freshSubs = await getSubtitleTracks(item.Id, mediaSourceId);
          const freshTarget = freshSubs.find((t) => t.index === index);
          if (freshTarget) {
            updateState({ textTracks: freshSubs, subtitleStreamIndex: index });
            activePlayerRef.current.setSubtitleStreamIndex(index);
            return;
          }
        } catch (e) {
          console.warn("Failed to check sidecar tracks during switch", e);
        }
      }

      if (!item) return;

      const startTicks = Math.floor(playbackState.currentTime * 10000000);

      play(item, {
        mediaSourceId: playbackState.currentMediaSource?.Id || undefined,
        startPositionTicks: startTicks,
        subtitleStreamIndex: index,
      });

      updateState({ subtitleStreamIndex: index });
    },
    [
      play,
      playbackState.currentItem,
      playbackState.currentMediaSource,
      playbackState.currentTime,
      playbackState.textTracks,
      updateState,
    ],
  );

  const setPreferredQuality = useCallback(
    (quality: string) => {
      updateState({ preferredQuality: quality });
    },
    [updateState],
  );

  useEffect(() => {
    const report = async () => {
      const state = latestStateRef.current;
      const item = state.currentItem;
      const mediaSource = state.currentMediaSource;
      const sessionId = playSessionIdRef.current;

      if (!item?.Id || !mediaSource?.Id || !sessionId || state.paused) return;

      await reportPlaybackProgress(
        item.Id,
        mediaSource.Id,
        sessionId,
        Math.floor(state.currentTime * 10000000),
        state.paused,
      ).catch((e) => console.error("Failed to report progress", e));
    };

    const interval = setInterval(report, 10000); // 10s interval
    return () => clearInterval(interval);
  }, []);

  const toggleMiniPlayer = useCallback(() => {
    setPlaybackState((prev) => ({ ...prev, isMiniPlayer: !prev.isMiniPlayer }));
  }, []);

  const setMiniPlayer = useCallback((enabled: boolean) => {
    setPlaybackState((prev) => ({ ...prev, isMiniPlayer: enabled }));
  }, []);

  const setSubtitleUrl = useCallback(
    async (url: string) => {
      try {
        console.log("[subtitle-url] Fetching:", url);
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch subtitle: ${response.statusText}`);
        }

        const content = await response.text();
        console.log("[subtitle-url] Content length:", content.length, "First 200 chars:", content.substring(0, 200));
        const vttContent = convertSubtitleToVTT(content);
        console.log("[subtitle-url] VTT length:", vttContent.length, "First 200 chars:", vttContent.substring(0, 200));
        const blob = new Blob([vttContent], { type: "text/vtt" });
        const blobUrl = URL.createObjectURL(blob);

        // Preserve existing Jellyfin tracks, add online track
        const existingTracks = (playbackState.textTracks || []).filter(
          (t) => t.index !== 9999
        );
        const newTrack = {
          kind: "subtitles",
          label: "English (Online)",
          src: blobUrl,
          language: "en",
          default: true,
          index: 9999,
        };

        const updatedTracks = [...existingTracks, newTrack];

        updateState({
          textTracks: updatedTracks,
          subtitleStreamIndex: 9999,
        });

        if (activePlayerRef.current) {
          activePlayerRef.current.setSubtitleStreamIndex(9999);
        } else {
          console.warn("No active player found");
        }
      } catch (error) {
        console.error("Error loading subtitle from URL:", error);
        throw error;
      }
    },
    [playbackState.textTracks, updateState],
  );

  return {
    playbackState,
    play,
    pause,
    unpause,
    stop,
    next,
    previous,
    seek,
    setVolume,
    setMute,
    toggleMute,
    toggleFavorite,
    setPlaybackRate,
    setAudioStreamIndex,
    setSubtitleStreamIndex,
    setSubtitleUrl,
    registerPlayer,
    unregisterPlayer,
    reportState: updateState,
    setPreferredQuality,
    toggleMiniPlayer,
    setMiniPlayer,
  };
}

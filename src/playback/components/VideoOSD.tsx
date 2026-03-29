"use client";
import React, { useState, useEffect, useMemo } from "react";
import { useAtom } from "jotai";
import { isFullscreenAtom } from "../../lib/atoms";
import { PlaybackContextValue } from "../hooks/usePlaybackManager";
import { fetchSeasons } from "../../actions";
import { useTrickplay } from "../../hooks/useTrickplay";
import { useSkipSegments } from "../../hooks/useSkipSegments";
import { VideoSplashLoader } from "./VideoSplashLoader";
import { getNextEpisode, getPreviousEpisode } from "@/src/actions/media";
import _ from "lodash";
import { VideoOSDHeader } from "./osd/VideoOSDHeader";
import { VideoOSDPlayButton } from "./osd/VideoOSDPlayButton";
import { VideoOSDSkipButtons } from "./osd/VideoOSDSkipButtons";
import { VideoOSDTransport } from "./osd/VideoOSDTransport";
import { VideoOSDTimeline } from "./osd/VideoOSDTimeline";
import { Maximize } from "lucide-react";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useSyncPlayGuard } from "../hooks/useSyncPlayGuard";

interface VideoOSDProps {
  manager: PlaybackContextValue;
  className?: string;
}

const dateObject = Date.now();

export const VideoOSD: React.FC<VideoOSDProps> = ({ manager }) => {
  const guard = useSyncPlayGuard();
  const { playbackState } = manager;
  const {
    paused,
    currentTime,
    duration,
    currentItem,
    currentMediaSource,
    volume,
    muted,
    isMiniPlayer,
    isLoading,
    isBuffering,
    buffered,
  } = playbackState;
  const { initializeTrickplay, renderThumbnail } = useTrickplay();
  const { checkSegment } = useSkipSegments(currentItem?.Id);
  const activeSegment = checkSegment(currentTime);
  const durationSeconds = duration;

  const { chapters, activeChapter } = useMemo(() => {
    const chapters = (currentItem as any)?.Chapters || [];

    const activeChapter =
      currentTime !== null
        ? chapters.find((ch: any, i: number) => {
            const start = ch.StartPositionTicks / 10000000;
            const nextCh = chapters[i + 1];
            const end = nextCh
              ? nextCh.StartPositionTicks / 10000000
              : durationSeconds;
            return currentTime >= start && currentTime < end;
          })
        : null;

    return {
      chapters,
      activeChapter,
    };
  }, [currentItem, currentTime, durationSeconds]);

  useEffect(() => {
    if (currentItem) {
      initializeTrickplay(currentItem as any, currentMediaSource || null);
    }
  }, [currentItem, currentMediaSource, initializeTrickplay]);

  const [isHovering, setIsHovering] = useState(false);
  const [lastActivity, setLastActivity] = useState(dateObject);
  const [nextEpisodeData, setNextEpisodeData] = useState<BaseItemDto | null>(
    null,
  );
  const [previousEpisodeData, setPreviousEpisodeData] =
    useState<BaseItemDto | null>(null);

  const hasNextEpisode = !_.isEmpty(nextEpisodeData);
  const hasPreviousEpisode = !_.isEmpty(previousEpisodeData);

  useEffect(() => {
    const checkEpisodes = async () => {
      try {
        if (currentItem?.Type !== "Episode") {
          setNextEpisodeData(null);
          setPreviousEpisodeData(null);
          return;
        }

        const seriesId = (currentItem as any)?.SeriesId;
        const parentIndexNumber = currentItem?.ParentIndexNumber;
        const episodeNumber = currentItem?.IndexNumber;

        if (!seriesId || !parentIndexNumber) {
          setNextEpisodeData(null);
          setPreviousEpisodeData(null);
          return;
        }

        const seasons = await fetchSeasons(seriesId);

        const seasonData = seasons.find(
          (s: any) => s.IndexNumber === parentIndexNumber,
        );
        if (!seasonData || !seasonData.Id) {
          setNextEpisodeData(null);
          setPreviousEpisodeData(null);
          return;
        }

        const seasonId = seasonData.Id;

        const [nextEpisode, previousEpisode] = await Promise.all([
          getNextEpisode(seasonId, episodeNumber),
          getPreviousEpisode(seasonId, episodeNumber),
        ]);

        setNextEpisodeData(nextEpisode || null);
        setPreviousEpisodeData(previousEpisode || null);
      } catch (err) {
        setNextEpisodeData(null);
        setPreviousEpisodeData(null);
      }
    };

    checkEpisodes();
  }, [currentItem]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!paused && Date.now() - lastActivity > 3000) {
        setIsHovering(false);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [paused, lastActivity]);

  const handleMouseMove = () => {
    setLastActivity(Date.now());
    setIsHovering(true);
  };

  const [scrubbingValue, setScrubbingValue] = useState<number | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);

  const episodePlayOptions = useMemo(() => {
    const {
      audioStreamIndex,
      subtitleStreamIndex,
      currentMediaSource,
      textTracks,
    } = playbackState;
    const options: any = { startPositionTicks: 0 };

    if (audioStreamIndex !== undefined && currentMediaSource?.MediaStreams) {
      const currentAudioTrack = currentMediaSource.MediaStreams.find(
        (s: any) => s.Type === "Audio" && s.Index === audioStreamIndex,
      );
      if (currentAudioTrack?.Language) {
        options.audioLanguage = currentAudioTrack.Language;
      }
    }

    if (subtitleStreamIndex === -1) {
      options.subtitleStreamIndex = -1;
    } else if (subtitleStreamIndex !== undefined && textTracks) {
      const currentSubtitleTrack = textTracks.find(
        (t: any) => t.index === subtitleStreamIndex,
      );
      if (currentSubtitleTrack?.language) {
        options.subtitleLanguage = currentSubtitleTrack.language;
      }
    }

    return options;
  }, [
    playbackState.audioStreamIndex,
    playbackState.subtitleStreamIndex,
    playbackState.currentMediaSource,
    playbackState.textTracks,
  ]);

  // Helper to coordinate scrubbing state between Timeline and Parent
  const handleScrubStart = (val: number) => {
    setIsScrubbing(true);
    setScrubbingValue(val);
  };

  const handleScrubMove = (val: number) => {
    if (isScrubbing) {
      setScrubbingValue(val);
    } else {
      setHoverTime(val);
    }
  };

  const handleScrubEnd = (val: number) => {
    if (isScrubbing) {
      guard.seek(val * 10000000);
      setScrubbingValue(null);
    }
    setIsScrubbing(false);
  };

  // Global mouse up to catch drag end outside timeline
  useEffect(() => {
    const onGlobalMouseUp = () => {
      if (isScrubbing) {
        if (scrubbingValue !== null) {
          guard.seek(scrubbingValue * 10000000);
          setScrubbingValue(null);
        }
        setIsScrubbing(false);
      }
    };
    window.addEventListener("mouseup", onGlobalMouseUp);
    return () => window.removeEventListener("mouseup", onGlobalMouseUp);
  }, [isScrubbing, scrubbingValue, manager]);

  const activeThumbTime = scrubbingValue !== null ? scrubbingValue : hoverTime;
  const thumbnail =
    activeThumbTime !== null ? renderThumbnail(activeThumbTime) : null;

  const isVisible = isHovering || paused;

  const handleOverlayClick = () => {
    handleMouseMove();
    if (paused) {
      guard.play();
    } else {
      guard.pause();
    }
  };

  const [isFullscreen] = useAtom(isFullscreenAtom);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement
        .requestFullscreen()
        .catch((e) => console.error("Fullscreen error:", e));
    } else {
      document
        .exitFullscreen()
        .catch((e) => console.error("Exit fullscreen error:", e));
    }
  };

  const handleControlsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleMouseMove();
  };

  if (isMiniPlayer) {
    return (
      <div
        className="absolute inset-0 z-50 flex items-center justify-center bg-black/0 hover:bg-black/40 transition-all duration-300 cursor-pointer group"
        onClick={manager.toggleMiniPlayer}
      >
        <div className="bg-black/50 p-3 rounded-full backdrop-blur-sm opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100 transition-all duration-300">
          <Maximize className="w-6 h-6 text-white" />
        </div>
      </div>
    );
  }

  return (
    <>
      <VideoSplashLoader
        item={currentItem}
        isVisible={isLoading || isBuffering || false}
        onClose={() => guard.stop()}
      />
      <div
        className="absolute inset-0 z-40 transition-opacity duration-300 pointer-events-none"
        style={{
          opacity: isVisible ? 1 : 0,
          background:
            "radial-gradient(ellipse at center, transparent 0%, rgba(0, 0, 0, 0.6) 100%)",
        }}
      />
      <div
        className="absolute inset-0 z-50 flex flex-col justify-between transition-opacity duration-300 p-6 md:p-10"
        onMouseMove={handleMouseMove}
        onClick={handleOverlayClick}
        style={{
          opacity: isVisible ? 1 : 0,
        }}
      >
        <VideoOSDHeader
          manager={manager}
          isVisible={isVisible}
          currentItem={currentItem}
          onBack={() => manager.stop()}
          onControlsClick={handleControlsClick}
        />

        <VideoOSDPlayButton paused={paused} />

        <VideoOSDSkipButtons
          manager={manager}
          activeSegment={activeSegment}
          hasNextEpisode={hasNextEpisode}
          nextEpisodeData={nextEpisodeData}
          handleMouseMove={handleMouseMove}
          episodePlayOptions={episodePlayOptions}
          onSeek={guard.seek}
          onPause={guard.pause}
        />

        <div
          className={`w-full max-w-5xl mx-auto transition-transform duration-300 ${isVisible ? "translate-y-0" : "translate-y-full"}`}
          onClick={handleControlsClick}
        >
          <div
            className="rounded-2xl p-4 md:px-6 md:py-4 flex flex-col gap-4 shadow-2xl transition-all duration-300 backdrop-blur-md border border-white/10"
            style={{
              background: "rgba(20, 20, 20, 0.4)",
            }}
          >
            <VideoOSDTimeline
              manager={manager}
              currentTime={currentTime}
              duration={duration}
              buffered={buffered}
              chapters={chapters}
              isScrubbing={isScrubbing}
              scrubbingValue={scrubbingValue}
              activeChapter={activeChapter}
              thumbnail={thumbnail}
              renderThumbnail={renderThumbnail}
              onScrubStart={handleScrubStart}
              onScrubMove={handleScrubMove}
              onScrubEnd={handleScrubEnd}
            />

            <VideoOSDTransport
              manager={manager}
              currentTime={currentTime}
              duration={duration}
              paused={paused}
              muted={muted}
              volume={volume}
              isFullscreen={isFullscreen}
              toggleFullscreen={toggleFullscreen}
              showEpisodeNavigation={currentItem?.Type === "Episode"}
              hasNextEpisode={hasNextEpisode}
              hasPreviousEpisode={hasPreviousEpisode}
              onNextEpisode={() => {
                if (nextEpisodeData) {
                  manager.play(nextEpisodeData, episodePlayOptions);
                }
              }}
              onPreviousEpisode={() => {
                if (previousEpisodeData) {
                  manager.play(previousEpisodeData, episodePlayOptions);
                }
              }}
              onSeekBack={() => guard.seek(Math.max(0, currentTime - 10) * 10000000)}
              onSeekForward={() => guard.seek(Math.min(duration, currentTime + 10) * 10000000)}
              onPlayPause={() => {
                if (paused) {
                  guard.play();
                } else {
                  guard.pause();
                }
              }}
            />
          </div>
        </div>
      </div>
    </>
  );
};

// This code is a polyfill (compatibility fix) that forces the browser's TimeRanges object to behave like an array so you can loop over it.
if (
  typeof TimeRanges !== "undefined" &&
  !(TimeRanges.prototype as any)[Symbol.iterator]
) {
  (TimeRanges.prototype as any)[Symbol.iterator] = function* (
    this: TimeRanges,
  ) {
    for (let i = 0; i < this.length; i++) {
      yield i;
    }
  };
}

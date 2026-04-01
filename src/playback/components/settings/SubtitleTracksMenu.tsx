"use client";
import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "../../../components/ui/dropdown-menu";
import { Captions, Type, Loader2, Globe } from "lucide-react";
import { PlaybackContextValue } from "../../hooks/usePlaybackManager";
import { getSubtitleTracks, fetchMediaDetails } from "../../../actions";
import { searchSubdlSubtitles, isSubdlConfigured } from "../../../actions/subdl";
import type { SubdlSubtitle } from "../../../actions/subdl";
import { SettingsMenuButton } from "./SettingsMenuButton";

interface SubtitleTracksMenuProps {
  manager: PlaybackContextValue;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function pickBestSubtitle(
  subtitles: SubdlSubtitle[],
  episodeNumber?: number
): SubdlSubtitle | null {
  if (subtitles.length === 0) return null;

  const nonHi = subtitles.filter((s) => !s.hearingImpaired);
  const candidates = nonHi.length > 0 ? nonHi : subtitles;

  if (episodeNumber) {
    const paddedEp = String(episodeNumber).padStart(2, "0");
    const patterns = [
      `E${paddedEp}`,
      `E${episodeNumber}`,
      `Episode.${episodeNumber}`,
      `Episode ${episodeNumber}`,
    ];
    for (const pattern of patterns) {
      const match = candidates.find((s) =>
        s.releaseName.toUpperCase().includes(pattern.toUpperCase())
      );
      if (match) return match;
    }
  }

  return candidates[0];
}

export const SubtitleTracksMenu: React.FC<SubtitleTracksMenuProps> = ({
  manager,
  open,
  onOpenChange,
}) => {
  const { playbackState } = manager;
  const { currentItem, currentMediaSource } = playbackState;
  const [subtitleTracks, setSubtitleTracks] = useState<any[]>([]);
  const [onlineResults, setOnlineResults] = useState<SubdlSubtitle[]>([]);
  const [onlineSearching, setOnlineSearching] = useState(false);
  const [onlineSearchDone, setOnlineSearchDone] = useState(false);
  const [loadingOnlineIndex, setLoadingOnlineIndex] = useState<number | null>(null);
  const [activeOnlineIndex, setActiveOnlineIndex] = useState<number | null>(null);
  const [subdlAvailable, setSubdlAvailable] = useState(false);

  const [subtitleSize, setSubtitleSize] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("fable-subtitle-size");
      return saved ? parseInt(saved, 10) : 100;
    }
    return 100;
  });

  // Fetch Jellyfin tracks
  useEffect(() => {
    async function fetchTracks() {
      if (currentItem?.Id && currentMediaSource?.Id) {
        try {
          const subs = await getSubtitleTracks(
            currentItem.Id,
            currentMediaSource.Id,
          );
          setSubtitleTracks(subs);
        } catch (error) {
          console.error("Failed to fetch subtitle tracks", error);
        }
      }
    }
    fetchTracks();
  }, [currentItem?.Id, currentMediaSource?.Id]);

  // Check if Subdl is configured
  useEffect(() => {
    isSubdlConfigured().then(setSubdlAvailable).catch(() => {});
  }, []);

  // Reset when item changes
  useEffect(() => {
    setOnlineResults([]);
    setOnlineSearchDone(false);
  }, [currentItem?.Id]);

  // Filter Jellyfin tracks to English only
  const englishTracks = React.useMemo(() => {
    return subtitleTracks.filter((track) => {
      const lang = (track.language || "").toLowerCase();
      return lang === "eng" || lang === "en" || lang === "english" || lang === "";
    });
  }, [subtitleTracks]);

  // On-demand Subdl search — only fires when user taps "Search online"
  const handleSearchOnline = useCallback(async () => {
    if (onlineSearching || onlineSearchDone) return;

    setOnlineSearching(true);
    const deadline = setTimeout(() => {
      setOnlineSearching(false);
      setOnlineSearchDone(true);
    }, 6000);

    try {
      const isEpisode = currentItem?.Type === "Episode";
      let imdbId: string | undefined;
      let tmdbId: string | undefined;

      if (isEpisode) {
        const seriesId = (currentItem as any)?.SeriesId;
        if (seriesId) {
          try {
            const series = await fetchMediaDetails(seriesId);
            imdbId = series?.ProviderIds?.Imdb ?? undefined;
            tmdbId = series?.ProviderIds?.Tmdb ?? undefined;
          } catch {}
        }
      }

      if (!imdbId && !tmdbId) {
        imdbId = (currentItem as any)?.ProviderIds?.Imdb;
        tmdbId = (currentItem as any)?.ProviderIds?.Tmdb;
      }

      const searchId = imdbId || tmdbId || (currentItem as any)?.SeriesName || currentItem?.Name;
      if (!searchId) return;

      const episodeNumber = isEpisode ? (currentItem as any)?.IndexNumber : undefined;

      const result = await searchSubdlSubtitles(searchId, {
        type: isEpisode ? "tv" : "movie",
        seasonNumber: isEpisode ? (currentItem as any)?.ParentIndexNumber : undefined,
        episodeNumber,
        languages: "EN",
      });

      setOnlineResults(result.subtitles.slice(0, 8));
    } catch {
      // Not critical
    } finally {
      clearTimeout(deadline);
      setOnlineSearching(false);
      setOnlineSearchDone(true);
    }
  }, [currentItem, onlineSearching, onlineSearchDone]);

  // Load an online subtitle by index
  const handleLoadOnline = async (subtitle: SubdlSubtitle, index: number) => {
    setLoadingOnlineIndex(index);
    try {
      const isEpisode = currentItem?.Type === "Episode";
      const episodeNumber = isEpisode ? (currentItem as any)?.IndexNumber : undefined;

      const params = new URLSearchParams({
        path: subtitle.url,
        language: subtitle.languageCode.toLowerCase() || "eng",
        ...(episodeNumber ? { episode: String(episodeNumber) } : {}),
      });
      await manager.setSubtitleUrl(`/api/subdl/download?${params}`);
      setActiveOnlineIndex(index);
    } catch (error) {
      console.error("Failed to load online subtitle:", error);
    } finally {
      setLoadingOnlineIndex(null);
    }
  };

  const handleSubtitleSizeChange = (newSize: number) => {
    setSubtitleSize(newSize);
    localStorage.setItem("fable-subtitle-size", String(newSize));
    manager.reportState({ subtitleSize: newSize });
    window.dispatchEvent(
      new CustomEvent("subtitle-size-change", { detail: { size: newSize } }),
    );
  };

  const handleSubtitleChange = (indexStr: string) => {
    const index = parseInt(indexStr);
    if (isNaN(index)) return;
    if (index === 9999) {
      manager.reportState({ subtitleStreamIndex: 9999 });
      return;
    }
    setActiveOnlineIndex(null);
    manager.setSubtitleStreamIndex(index);
  };

  const isOnlineActive = playbackState.subtitleStreamIndex === 9999;

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <SettingsMenuButton icon={Captions} isOpen={open} title="Subtitles" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        sideOffset={8}
        side="top"
        className="w-56 rounded-2xl overflow-hidden text-sm z-100 max-h-[60vh] overflow-y-auto"
        style={{
          background: "rgba(30, 30, 30, 0.65)",
          backdropFilter: "blur(40px)",
          WebkitBackdropFilter: "blur(40px)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
        }}
      >
        <DropdownMenuRadioGroup
          value={String(playbackState.subtitleStreamIndex ?? -1)}
          onValueChange={handleSubtitleChange}
        >
          {/* Off */}
          <DropdownMenuRadioItem
            value="-1"
            className="px-5 py-2.5 transition-colors hover:bg-white/10 text-white"
          >
            <span className="text-white/90 ml-3">Off</span>
          </DropdownMenuRadioItem>

          {/* Size slider */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "12px",
              padding: "12px 20px 8px 20px",
            }}
          >
            <Type
              size={18}
              style={{ color: "rgba(255, 255, 255, 0.7)", flexShrink: 0 }}
            />
            <input
              type="range"
              min="10"
              max="400"
              value={subtitleSize}
              onChange={(e) =>
                handleSubtitleSizeChange(parseInt(e.target.value, 10))
              }
              style={
                {
                  flex: 1,
                  height: "6px",
                  borderRadius: "3px",
                  background: `linear-gradient(to right, white 0%, white ${((subtitleSize - 10) / 390) * 100}%, rgba(255, 255, 255, 0.2) ${((subtitleSize - 10) / 390) * 100}%, rgba(255, 255, 255, 0.2) 100%)`,
                  outline: "none",
                  WebkitAppearance: "none",
                  appearance: "none",
                  cursor: "pointer",
                } as React.CSSProperties & { WebkitAppearance?: string }
              }
            />
          </div>

          <DropdownMenuSeparator className="bg-white/10" />

          {/* Jellyfin tracks — English only */}
          {englishTracks.map((track, i) => (
            <DropdownMenuRadioItem
              key={i}
              value={String(track.index)}
              className="px-5 py-2.5 transition-colors hover:bg-white/10 text-white"
            >
              <span className="text-white/90 ml-3">{track.label}</span>
            </DropdownMenuRadioItem>
          ))}

          {/* Subdl section — on-demand only */}
          {subdlAvailable && (
            <>
              <DropdownMenuSeparator className="bg-white/10" />

              {/* Online results list */}
              {onlineResults.map((subtitle, i) => {
                const isThisActive = isOnlineActive && activeOnlineIndex === i;
                return (
                  <button
                    key={`online-${i}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleLoadOnline(subtitle, i);
                    }}
                    disabled={loadingOnlineIndex !== null}
                    className={`w-full flex items-center gap-2.5 px-5 py-2 transition-colors text-left ${
                      isThisActive ? "bg-white/15 text-white" : "text-white/90 hover:bg-white/10"
                    }`}
                  >
                    {loadingOnlineIndex === i ? (
                      <Loader2 size={12} className="animate-spin shrink-0 text-white/70" />
                    ) : (
                      <Globe size={12} className={`shrink-0 ${isThisActive ? "text-primary" : "text-white/30"}`} />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate">{subtitle.releaseName}</p>
                      <p className="text-[11px] text-white/40 truncate">
                        {subtitle.language}
                        {subtitle.author && subtitle.author !== "none" ? ` \u00b7 ${subtitle.author}` : ""}
                      </p>
                    </div>
                  </button>
                );
              })}

              {/* Search button — only shows if not yet searched */}
              {!onlineSearchDone && !onlineSearching && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSearchOnline();
                  }}
                  className="w-full flex items-center gap-2.5 px-5 py-2.5 text-white/50 hover:text-white/70 hover:bg-white/10 transition-colors text-left"
                >
                  <Globe size={14} className="shrink-0" />
                  <span className="text-sm">Search online</span>
                </button>
              )}

              {/* Searching state */}
              {onlineSearching && (
                <div className="flex items-center gap-2.5 px-5 py-2.5 text-white/40">
                  <Loader2 size={14} className="animate-spin" />
                  <span className="text-sm">Searching...</span>
                </div>
              )}

              {/* No results */}
              {onlineSearchDone && onlineResults.length === 0 && (
                <div className="px-5 py-2 text-white/30 text-xs">
                  No online subtitles found
                </div>
              )}
            </>
          )}

          {!subdlAvailable && englishTracks.length === 0 && (
            <div className="px-5 py-2.5 text-white/40 text-sm">
              No subtitles available
            </div>
          )}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

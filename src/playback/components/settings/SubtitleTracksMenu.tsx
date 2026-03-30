"use client";
import React, { useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "../../../components/ui/dropdown-menu";
import { Captions, Type, Globe, Loader2, Ear } from "lucide-react";
import { PlaybackContextValue } from "../../hooks/usePlaybackManager";
import { getSubtitleTracks } from "../../../actions";
import { searchSubdlSubtitles, isSubdlConfigured } from "../../../actions/subdl";
import type { SubdlSubtitle } from "../../../actions/subdl";
import { SettingsMenuButton } from "./SettingsMenuButton";

interface SubtitleTracksMenuProps {
  manager: PlaybackContextValue;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SubtitleTracksMenu: React.FC<SubtitleTracksMenuProps> = ({
  manager,
  open,
  onOpenChange,
}) => {
  const { playbackState } = manager;
  const { currentItem, currentMediaSource } = playbackState;
  const [subtitleTracks, setSubtitleTracks] = useState<any[]>([]);
  const [subdlResults, setSubdlResults] = useState<SubdlSubtitle[]>([]);
  const [subdlAvailable, setSubdlAvailable] = useState(false);
  const [subdlLoading, setSubdlLoading] = useState(false);
  const [subdlSearched, setSubdlSearched] = useState(false);
  const [loadingSubdlIndex, setLoadingSubdlIndex] = useState<number | null>(null);

  const [subtitleSize, setSubtitleSize] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("fable-subtitle-size");
      return saved ? parseInt(saved, 10) : 100;
    }
    return 100;
  });

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
    isSubdlConfigured().then(setSubdlAvailable);
  }, []);

  // Reset Subdl state when item changes
  useEffect(() => {
    setSubdlResults([]);
    setSubdlSearched(false);
  }, [currentItem?.Id]);

  const handleSearchOnline = async () => {
    const imdbId = (currentItem as any)?.ProviderIds?.Imdb;
    if (!imdbId) return;

    setSubdlLoading(true);
    try {
      const itemType = currentItem?.Type;
      const isEpisode = itemType === "Episode";

      const result = await searchSubdlSubtitles(imdbId, {
        type: isEpisode ? "tv" : "movie",
        seasonNumber: isEpisode ? (currentItem as any)?.ParentIndexNumber : undefined,
        episodeNumber: isEpisode ? (currentItem as any)?.IndexNumber : undefined,
        languages: "EN",
      });

      setSubdlResults(result.subtitles);
      setSubdlSearched(true);
    } catch {
      setSubdlSearched(true);
    } finally {
      setSubdlLoading(false);
    }
  };

  const handleSelectSubdl = async (subtitle: SubdlSubtitle, index: number) => {
    setLoadingSubdlIndex(index);
    try {
      // Fetch the subtitle via our download proxy (extracts from zip server-side)
      // Also passes itemId so the proxy saves it to Jellyfin for future users
      const params = new URLSearchParams({
        path: subtitle.url,
        ...(currentItem?.Id ? { itemId: currentItem.Id } : {}),
        language: subtitle.languageCode.toLowerCase() || "eng",
        ...(subtitle.hearingImpaired ? { hi: "true" } : {}),
      });
      const downloadUrl = `/api/subdl/download?${params}`;
      await manager.setSubtitleUrl(downloadUrl);
    } catch (error) {
      console.error("Failed to load Subdl subtitle:", error);
    } finally {
      setLoadingSubdlIndex(null);
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
    if (isNaN(index)) {
      return;
    }

    if (index === 9999) {
      manager.reportState({ subtitleStreamIndex: 9999 });
      return;
    }

    manager.setSubtitleStreamIndex(index);
  };

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
          <DropdownMenuRadioItem
            value="-1"
            className="px-5 py-2.5 transition-colors hover:bg-white/10 text-white"
          >
            <span className="text-white/90 ml-3">Off</span>
          </DropdownMenuRadioItem>

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
                } as React.CSSProperties & {
                  WebkitAppearance?: string;
                }
              }
            />
          </div>

          <DropdownMenuSeparator className="bg-white/10" />

          {subtitleTracks.map((track, i) => (
            <DropdownMenuRadioItem
              key={i}
              value={String(track.index)}
              className="px-5 py-2.5 transition-colors hover:bg-white/10 text-white"
            >
              <span className="text-white/90 ml-3">{track.label}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        {/* Subdl online search section */}
        {subdlAvailable && (
          <>
            <DropdownMenuSeparator className="bg-white/10" />

            {!subdlSearched ? (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSearchOnline();
                }}
                disabled={subdlLoading}
                className="w-full flex items-center gap-2.5 px-5 py-2.5 text-white/70 hover:text-white hover:bg-white/10 transition-colors text-left"
              >
                {subdlLoading ? (
                  <Loader2 size={14} className="animate-spin shrink-0" />
                ) : (
                  <Globe size={14} className="shrink-0" />
                )}
                <span className="text-sm">
                  {subdlLoading ? "Searching..." : "Search online"}
                </span>
              </button>
            ) : subdlResults.length === 0 ? (
              <div className="px-5 py-2.5 text-white/40 text-sm">
                No online subtitles found
              </div>
            ) : (
              <>
                <div className="px-5 py-1.5 text-white/40 text-[11px] uppercase tracking-wider font-medium">
                  Online
                </div>
                {subdlResults.slice(0, 8).map((subtitle, i) => (
                  <button
                    key={i}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleSelectSubdl(subtitle, i);
                    }}
                    disabled={loadingSubdlIndex !== null}
                    className="w-full flex items-center gap-2.5 px-5 py-2 text-white/90 hover:bg-white/10 transition-colors text-left"
                  >
                    {loadingSubdlIndex === i ? (
                      <Loader2 size={12} className="animate-spin shrink-0" />
                    ) : subtitle.hearingImpaired ? (
                      <Ear size={12} className="shrink-0 text-white/50" />
                    ) : (
                      <div className="w-3 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate">{subtitle.releaseName}</p>
                      <p className="text-[11px] text-white/40 truncate">
                        {subtitle.language}
                        {subtitle.author && subtitle.author !== "none" ? ` \u00b7 ${subtitle.author}` : ""}
                      </p>
                    </div>
                  </button>
                ))}
              </>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

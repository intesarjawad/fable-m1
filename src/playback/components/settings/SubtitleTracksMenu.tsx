"use client";
import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "../../../components/ui/dropdown-menu";
import { Captions, Type, Loader2, Ear, Download } from "lucide-react";
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

function normalizeLanguageCode(code: string): string {
  const lower = code.toLowerCase().trim();
  const languageMap: Record<string, string> = {
    en: "en", eng: "en", english: "en",
    es: "es", spa: "es", spanish: "es",
    fr: "fr", fre: "fr", fra: "fr", french: "fr",
    de: "de", ger: "de", deu: "de", german: "de",
    it: "it", ita: "it", italian: "it",
    pt: "pt", por: "pt", portuguese: "pt",
    ja: "ja", jpn: "ja", japanese: "ja",
    ko: "ko", kor: "ko", korean: "ko",
    zh: "zh", chi: "zh", zho: "zh", chinese: "zh",
    ar: "ar", ara: "ar", arabic: "ar",
    ru: "ru", rus: "ru", russian: "ru",
  };
  return languageMap[lower] || lower;
}

function isEnglish(languageCode: string): boolean {
  return normalizeLanguageCode(languageCode) === "en";
}

/** Unified subtitle item */
interface MergedSubtitleItem {
  source: "jellyfin" | "subdl";
  label: string;
  sublabel?: string;
  language: string;
  hearingImpaired: boolean;
  jellyfinIndex?: number;
  subdlSubtitle?: SubdlSubtitle;
  subdlIndex?: number;
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
  const [subdlLoading, setSubdlLoading] = useState(false);
  const [loadingSubdlIndex, setLoadingSubdlIndex] = useState<number | null>(null);

  // Track which item we've searched to avoid repeats
  const searchedItemIdRef = useRef<string | null>(null);

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

  // Reset when item changes
  useEffect(() => {
    setSubdlResults([]);
    searchedItemIdRef.current = null;
  }, [currentItem?.Id]);

  // Subdl search — triggered once when menu opens for a new item
  const runSubdlSearch = useCallback(async () => {
    const itemId = currentItem?.Id;
    if (!itemId || searchedItemIdRef.current === itemId) return;
    searchedItemIdRef.current = itemId;

    // Check if Subdl is even configured
    const available = await isSubdlConfigured().catch(() => false);
    if (!available) return;

    setSubdlLoading(true);

    // Hard 6-second deadline for the entire search
    const deadline = setTimeout(() => setSubdlLoading(false), 6000);

    try {
      const itemType = currentItem?.Type;
      const isEpisode = itemType === "Episode";
      let imdbId: string | undefined;
      let tmdbId: string | undefined;

      console.log("[subdl-client] Starting search. Type:", itemType, "Item:", currentItem?.Name);
      console.log("[subdl-client] ProviderIds:", JSON.stringify((currentItem as any)?.ProviderIds));
      console.log("[subdl-client] SeriesId:", (currentItem as any)?.SeriesId);

      // For episodes, fetch series to get correct IMDB ID
      if (isEpisode) {
        const seriesId = (currentItem as any)?.SeriesId;
        if (seriesId) {
          try {
            console.log("[subdl-client] Fetching series details for:", seriesId);
            const series = await fetchMediaDetails(seriesId);
            console.log("[subdl-client] Series ProviderIds:", JSON.stringify(series?.ProviderIds));
            imdbId = series?.ProviderIds?.Imdb ?? undefined;
            tmdbId = series?.ProviderIds?.Tmdb ?? undefined;
          } catch (e) {
            console.error("[subdl-client] Series fetch failed:", e);
          }
        }
      }

      // Fall back to item's own IDs
      if (!imdbId && !tmdbId) {
        imdbId = (currentItem as any)?.ProviderIds?.Imdb;
        tmdbId = (currentItem as any)?.ProviderIds?.Tmdb;
      }

      // Build search query — ID or name
      const searchId = imdbId || tmdbId || (currentItem as any)?.SeriesName || currentItem?.Name;
      console.log("[subdl-client] Search ID:", searchId);
      if (!searchId) return;

      const result = await searchSubdlSubtitles(searchId, {
        type: isEpisode ? "tv" : "movie",
        seasonNumber: isEpisode ? (currentItem as any)?.ParentIndexNumber : undefined,
        episodeNumber: isEpisode ? (currentItem as any)?.IndexNumber : undefined,
        languages: "EN",
      });

      console.log("[subdl-client] Got results:", result.subtitles.length);
      setSubdlResults(result.subtitles);
    } catch {
      // Not critical
    } finally {
      clearTimeout(deadline);
      setSubdlLoading(false);
    }
  }, [currentItem]);

  // Trigger search when menu opens
  useEffect(() => {
    if (open) runSubdlSearch();
  }, [open, runSubdlSearch]);

  const handleSelectSubdl = async (subtitle: SubdlSubtitle, index: number) => {
    setLoadingSubdlIndex(index);
    try {
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
    if (isNaN(index)) return;
    if (index === 9999) {
      manager.reportState({ subtitleStreamIndex: 9999 });
      return;
    }
    manager.setSubtitleStreamIndex(index);
  };

  // Build merged + sorted subtitle list
  const mergedSubtitles = useMemo(() => {
    const items: MergedSubtitleItem[] = [];

    for (const track of subtitleTracks) {
      items.push({
        source: "jellyfin",
        label: track.label || "Unknown",
        language: track.language || "",
        hearingImpaired: track.label?.toLowerCase().includes("sdh") ||
          track.label?.toLowerCase().includes("hearing") || false,
        jellyfinIndex: track.index,
      });
    }

    for (let i = 0; i < subdlResults.length && i < 10; i++) {
      const subtitle = subdlResults[i];
      items.push({
        source: "subdl",
        label: subtitle.releaseName,
        sublabel: subtitle.language +
          (subtitle.author && subtitle.author !== "none" ? ` \u00b7 ${subtitle.author}` : ""),
        language: subtitle.languageCode,
        hearingImpaired: subtitle.hearingImpaired,
        subdlSubtitle: subtitle,
        subdlIndex: i,
      });
    }

    // Sort: English first, Jellyfin before Subdl within each language
    items.sort((a, b) => {
      const aEn = isEnglish(a.language);
      const bEn = isEnglish(b.language);
      if (aEn && !bEn) return -1;
      if (!aEn && bEn) return 1;

      const langCmp = normalizeLanguageCode(a.language).localeCompare(normalizeLanguageCode(b.language));
      if (langCmp !== 0) return langCmp;

      if (a.source === "jellyfin" && b.source === "subdl") return -1;
      if (a.source === "subdl" && b.source === "jellyfin") return 1;
      return 0;
    });

    return items;
  }, [subtitleTracks, subdlResults]);

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <SettingsMenuButton icon={Captions} isOpen={open} title="Subtitles" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        sideOffset={8}
        side="top"
        className="w-64 rounded-2xl overflow-hidden text-sm z-100 max-h-[60vh] overflow-y-auto"
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
                } as React.CSSProperties & { WebkitAppearance?: string }
              }
            />
          </div>

          <DropdownMenuSeparator className="bg-white/10" />

          {/* Merged subtitle list */}
          {mergedSubtitles.map((item) => {
            if (item.source === "jellyfin") {
              return (
                <DropdownMenuRadioItem
                  key={`jf-${item.jellyfinIndex}`}
                  value={String(item.jellyfinIndex)}
                  className="px-5 py-2 transition-colors hover:bg-white/10 text-white"
                >
                  <span className="text-white/90 ml-3 text-sm">{item.label}</span>
                </DropdownMenuRadioItem>
              );
            }

            const subdlIdx = item.subdlIndex!;
            return (
              <button
                key={`subdl-${subdlIdx}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSelectSubdl(item.subdlSubtitle!, subdlIdx);
                }}
                disabled={loadingSubdlIndex !== null}
                className="w-full flex items-center gap-2.5 px-5 py-2 text-white/90 hover:bg-white/10 transition-colors text-left"
              >
                {loadingSubdlIndex === subdlIdx ? (
                  <Loader2 size={12} className="animate-spin shrink-0 ml-0.5" />
                ) : item.hearingImpaired ? (
                  <Ear size={12} className="shrink-0 text-white/40 ml-0.5" />
                ) : (
                  <Download size={12} className="shrink-0 text-white/25 ml-0.5" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">{item.label}</p>
                  {item.sublabel && (
                    <p className="text-[11px] text-white/40 truncate">{item.sublabel}</p>
                  )}
                </div>
              </button>
            );
          })}

          {/* Subdl loading — non-blocking, below everything */}
          {subdlLoading && (
            <div className="flex items-center gap-2 px-5 py-2 text-white/30">
              <Loader2 size={12} className="animate-spin" />
              <span className="text-xs">Searching online...</span>
            </div>
          )}

          {!subdlLoading && mergedSubtitles.length === 0 && (
            <div className="px-5 py-2.5 text-white/40 text-sm">
              No subtitles available
            </div>
          )}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

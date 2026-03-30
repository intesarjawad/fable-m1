"use client";
import React, { useEffect, useState, useMemo, useRef } from "react";
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

/** Unified subtitle item — either from Jellyfin or Subdl */
interface MergedSubtitleItem {
  source: "jellyfin" | "subdl";
  label: string;
  sublabel?: string;
  language: string; // normalized lowercase: "en", "es", "fr"
  hearingImpaired: boolean;
  // Jellyfin-specific
  jellyfinIndex?: number;
  // Subdl-specific
  subdlSubtitle?: SubdlSubtitle;
  subdlIndex?: number;
}

function normalizeLanguageCode(code: string): string {
  const lower = code.toLowerCase().trim();
  // Map common variations to ISO 639-1
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
    hi: "hi", hin: "hi", hindi: "hi",
    ru: "ru", rus: "ru", russian: "ru",
    nl: "nl", dut: "nl", nld: "nl", dutch: "nl",
    sv: "sv", swe: "sv", swedish: "sv",
    da: "da", dan: "da", danish: "da",
    no: "no", nor: "no", norwegian: "no",
    fi: "fi", fin: "fi", finnish: "fi",
    pl: "pl", pol: "pl", polish: "pl",
    tr: "tr", tur: "tr", turkish: "tr",
    th: "th", tha: "th", thai: "th",
    vi: "vi", vie: "vi", vietnamese: "vi",
    id: "id", ind: "id", indonesian: "id",
    ms: "ms", may: "ms", msa: "ms", malay: "ms",
  };
  return languageMap[lower] || lower;
}

function isEnglish(languageCode: string): boolean {
  return normalizeLanguageCode(languageCode) === "en";
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
  const subdlSearchedForItemRef = useRef<string | null>(null); // tracks which item ID was searched
  const [loadingSubdlIndex, setLoadingSubdlIndex] = useState<number | null>(null);

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
    isSubdlConfigured().then(setSubdlAvailable);
  }, []);

  // Auto-search Subdl when menu opens — runs exactly once per item
  useEffect(() => {
    const currentItemId = currentItem?.Id || null;
    if (!open || !subdlAvailable || subdlLoading) return;
    if (subdlSearchedForItemRef.current === currentItemId) return; // already searched this item

    let cancelled = false;
    setSubdlLoading(true);
    subdlSearchedForItemRef.current = currentItemId;

    async function search() {
      try {
        const itemType = currentItem?.Type;
        const isEpisode = itemType === "Episode";

        // For episodes, ALWAYS use the series-level provider IDs.
        // Episode-level IMDB IDs are per-episode entries that Subdl doesn't
        // match against — Subdl wants the series IMDB ID + season/episode number.
        let providerIds = (currentItem as any)?.ProviderIds;

        if (isEpisode) {
          const seriesId = (currentItem as any)?.SeriesId;
          if (seriesId) {
            try {
              const series = await fetchMediaDetails(seriesId);
              if (series?.ProviderIds) {
                providerIds = series.ProviderIds;
              }
            } catch {
              // Series fetch failed — use episode's own IDs as fallback
            }
          }
        }

        const imdbId = providerIds?.Imdb;
        const tmdbId = providerIds?.Tmdb;

        // Search by IMDB/TMDB ID, or fall back to name search
        let result;
        if (imdbId || tmdbId) {
          const searchId = imdbId || tmdbId;
          result = await searchSubdlSubtitles(searchId!, {
            type: isEpisode ? "tv" : "movie",
            seasonNumber: isEpisode ? (currentItem as any)?.ParentIndexNumber : undefined,
            episodeNumber: isEpisode ? (currentItem as any)?.IndexNumber : undefined,
            languages: "EN",
          });
        } else {
          // No provider IDs — search by name
          const seriesName = (currentItem as any)?.SeriesName || currentItem?.Name;
          if (seriesName) {
            result = await searchSubdlSubtitles(seriesName, {
              type: isEpisode ? "tv" : "movie",
              seasonNumber: isEpisode ? (currentItem as any)?.ParentIndexNumber : undefined,
              episodeNumber: isEpisode ? (currentItem as any)?.IndexNumber : undefined,
              languages: "EN",
            });
          }
        }

        if (!cancelled && result) setSubdlResults(result.subtitles);
      } catch {
        // Subdl search failed — not critical, Jellyfin tracks still work
      } finally {
        if (!cancelled) setSubdlLoading(false);
      }
    }

    search();

    // Safety timeout — stop spinner after 8 seconds no matter what
    const timeout = setTimeout(() => {
      if (!cancelled) setSubdlLoading(false);
    }, 8000);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [open, subdlAvailable, subdlLoading, currentItem?.Id]);

  // Reset results when item changes (ref resets via the ID comparison above)
  useEffect(() => {
    setSubdlResults([]);
  }, [currentItem?.Id]);

  // Build merged + sorted subtitle list
  const mergedSubtitles = useMemo(() => {
    const items: MergedSubtitleItem[] = [];

    // Add Jellyfin tracks
    for (const track of subtitleTracks) {
      const language = track.language || "";
      items.push({
        source: "jellyfin",
        label: track.label || "Unknown",
        language,
        hearingImpaired: track.label?.toLowerCase().includes("sdh") ||
          track.label?.toLowerCase().includes("hearing") || false,
        jellyfinIndex: track.index,
      });
    }

    // Add Subdl results, deduplicating against Jellyfin tracks
    // A Subdl result is redundant if Jellyfin already has a track with
    // the same normalized language AND same HI status
    const jellyfinLanguageHiSet = new Set(
      items.map((item) => {
        const normalizedLanguage = normalizeLanguageCode(item.language);
        return `${normalizedLanguage}:${item.hearingImpaired}`;
      })
    );

    for (let i = 0; i < subdlResults.length && i < 10; i++) {
      const subtitle = subdlResults[i];
      const normalizedLanguage = normalizeLanguageCode(subtitle.languageCode);
      const dedupeKey = `${normalizedLanguage}:${subtitle.hearingImpaired}`;

      // Skip first match per language+HI combo (Jellyfin already has one)
      // But allow additional Subdl results (different releases/quality)
      const jellyfinHasMatch = jellyfinLanguageHiSet.has(dedupeKey);

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

    // Sort: English first, then alphabetically by language.
    // Within each language group: Jellyfin (instant) before Subdl (download).
    items.sort((a, b) => {
      const aIsEnglish = isEnglish(a.language);
      const bIsEnglish = isEnglish(b.language);
      if (aIsEnglish && !bIsEnglish) return -1;
      if (!aIsEnglish && bIsEnglish) return 1;

      // Same language priority — Jellyfin first
      const langCompare = normalizeLanguageCode(a.language).localeCompare(
        normalizeLanguageCode(b.language)
      );
      if (langCompare !== 0) return langCompare;

      if (a.source === "jellyfin" && b.source === "subdl") return -1;
      if (a.source === "subdl" && b.source === "jellyfin") return 1;

      return 0;
    });

    return items;
  }, [subtitleTracks, subdlResults]);

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

          {/* Merged subtitle list — always shows Jellyfin tracks immediately */}
          {mergedSubtitles.map((item, i) => {
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

            // Subdl item — custom button (not a radio item, triggers download)
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

          {/* Subdl loading indicator — below the list, non-blocking */}
          {subdlLoading && (
            <div className="flex items-center gap-2 px-5 py-2 text-white/30">
              <Loader2 size={12} className="animate-spin" />
              <span className="text-xs">Searching online...</span>
            </div>
          )}

          {/* Empty state — no subtitles found anywhere */}
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

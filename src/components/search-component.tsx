"use client";
import React, { useState, useEffect, useRef, useMemo } from "react";
import { Input } from "../components/ui/input";
import { Search, Plus } from "lucide-react";
import { searchItems } from "../actions";
import { searchTmdb } from "@/src/actions/tmdb";
import { SearchSuggestionItem } from "./search-suggestion-item";
import { RequestSheet } from "./request-sheet";

import * as Kbd from "../components/ui/kbd";
import { TextShimmer } from "./motion-primitives/text-shimmer";
import { useAuth } from "../hooks/useAuth";
import { useRiven } from "@/src/contexts/riven-context";
import { useJellyfinTmdbMap } from "@/src/hooks/use-jellyfin-tmdb-map";
import { useRequestState } from "@/src/hooks/use-request-state";
import { SidebarTrigger } from "../components/ui/sidebar";
import { useIsMobile } from "../hooks/use-mobile";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { requestMovie } from "@/src/actions/request";
import {
  getTmdbTitle,
  getTmdbYear,
  getTmdbMediaType,
  isTmdbMovie,
} from "@/src/types/tmdb";
import { tmdbPosterUrl } from "@/src/lib/tmdb";
import type { TmdbMediaItem, TmdbSearchResult, TmdbTvShow } from "@/src/types/tmdb";

interface SearchBarProps {
  className?: string;
}

export function SearchBar({ className = "" }: SearchBarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [tmdbSuggestions, setTmdbSuggestions] = useState<TmdbSearchResult[]>([]);
  const [requestSheetItem, setRequestSheetItem] = useState<TmdbTvShow | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const router = useRouter();
  const isMobile = useIsMobile();
  const isPlayerVisible = false;
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { serverUrl } = useAuth();
  const { isConnected: rivenConnected } = useRiven();
  const { tmdbMap } = useJellyfinTmdbMap();
  const { addRequest, getRequestByTmdbId } = useRequestState();

  // Memoized loading component to prevent re-rendering while typing, animation restarts every time without memoization
  const loadingComponent = useMemo(
    () => (
      <div className="flex justify-center items-center p-8">
        <TextShimmer className="text-sm font-mono">
          {`Searching ${
            serverUrl &&
            new URL(serverUrl).hostname.replace(/^(jellyfin\.|www\.)/, "")
          }...`}
        </TextShimmer>
      </div>
    ),
    [serverUrl],
  );

  // Debounced search
  useEffect(() => {
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }

    if (searchQuery.trim().length > 2) {
      setIsLoading(true);
      searchTimeout.current = setTimeout(async () => {
        try {
          const trimmedQuery = searchQuery.trim();

          // Run Jellyfin and TMDB searches in parallel
          const jellyfinPromise = searchItems(trimmedQuery);
          const tmdbPromise = rivenConnected
            ? searchTmdb(trimmedQuery)
            : Promise.resolve([]);

          const [jellyfinResults, tmdbResults] = await Promise.all([
            jellyfinPromise,
            tmdbPromise,
          ]);

          // Sort Jellyfin results to prioritize Movies and Series over Episodes and People
          const sortedResults = jellyfinResults.sort((a: any, b: any) => {
            const typePriority = { Movie: 1, Series: 2, Person: 3, Episode: 4 };
            const aPriority =
              typePriority[a.Type as keyof typeof typePriority] || 5;
            const bPriority =
              typePriority[b.Type as keyof typeof typePriority] || 5;
            return aPriority - bPriority;
          });
          setSuggestions(sortedResults.slice(0, 6));

          // Filter TMDB results to exclude items already in Jellyfin library
          const filteredTmdb = tmdbResults.filter(
            (item) => !tmdbMap.has(item.id)
          );
          setTmdbSuggestions(filteredTmdb);

          setShowSuggestions(true);
        } catch (error) {
          console.error("Search failed:", error);
          setSuggestions([]);
          setTmdbSuggestions([]);
        } finally {
          setIsLoading(false);
        }
      }, 300);
    } else {
      setSuggestions([]);
      setTmdbSuggestions([]);
      setShowSuggestions(false);
      setIsLoading(false);
    }

    return () => {
      if (searchTimeout.current) {
        clearTimeout(searchTimeout.current);
      }
    };
  }, [searchQuery, rivenConnected, tmdbMap]);

  // Global keyboard shortcut for search activation
  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "/" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.shiftKey &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA" &&
        !document.activeElement?.hasAttribute("contenteditable")
      ) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      document.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, []);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setShowSuggestions(false);
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch(e);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  const handleSuggestionClick = (item: any) => {
    setShowSuggestions(false);

    if (item.Type === "Movie") {
      router.push(`/movie/${item.Id}`);
    } else if (item.Type === "Series") {
      router.push(`/series/${item.Id}`);
    } else if (item.Type === "Person") {
      router.push(`/person/${item.Id}`);
    } else if (item.Type === "Episode") {
      router.push(`/search?q=${encodeURIComponent(item.Name)}`);
    }
  };

  const handleTmdbItemClick = async (item: TmdbSearchResult) => {
    // Only movies and TV shows are requestable — people and companies are informational
    const mediaType = getTmdbMediaType(item);
    if (mediaType !== "movie" && mediaType !== "tv") return;

    if (isTmdbMovie(item)) {
      const result = await requestMovie(item.id);
      if (result.success) {
        toast.success(`${item.title} requested`);
        addRequest({
          tmdbId: item.id,
          mediaType: "movie",
          title: item.title,
          posterPath: item.poster_path,
          requestedAt: new Date().toISOString(),
          status: "requested",
        });
      } else {
        toast.error(result.message);
      }
    } else {
      setRequestSheetItem(item as TmdbTvShow);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    if (e.target.value.trim().length > 2) {
      setShowSuggestions(true);
    }
  };

  const formatRuntime = (runTimeTicks?: number) => {
    if (!runTimeTicks) return null;
    const totalMinutes = Math.round(runTimeTicks / 600000000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  if (isPlayerVisible) {
    return null;
  }

  const hasJellyfinResults = suggestions.length > 0;
  const hasTmdbResults = tmdbSuggestions.length > 0;
  const hasAnyResults = hasJellyfinResults || hasTmdbResults;

  return (
    <div
      className={`relative z-99 md:max-w-xl ${className}`}
      ref={suggestionsRef}
    >
      <form onSubmit={handleSearch} className="flex gap-2">
        {/* Mobile Navigation Trigger - Only visible on mobile */}
        <div className="md:hidden">
          <SidebarTrigger className="bg-card border-border border text-foreground hover:bg-accent rounded-2xl h-11 w-11 p-0" />
        </div>

        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-foreground z-10" />
          <Input
            ref={inputRef}
            type="text"
            placeholder={
              isMobile
                ? "Search"
                : "Search movies, TV shows, episodes, and people..."
            }
            value={searchQuery}
            onChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            onFocus={() => {
              if (searchQuery.trim().length > 2 && (suggestions.length > 0 || tmdbSuggestions.length > 0)) {
                setShowSuggestions(true);
              }
            }}
            className="pl-10 pr-16 border-border text-foreground placeholder:text-muted-foreground h-11 rounded-2xl md:rounded-xl dark:bg-background/70 bg-background/90 backdrop-blur-md"
          />
          <div className="absolute right-4 top-1/2 transform -translate-y-1/2 z-10">
            <Kbd.Root variant="outline" size="lg">
              <Kbd.Key>/</Kbd.Key>
            </Kbd.Root>
          </div>
        </div>
      </form>

      {/* Search Suggestions Dropdown */}
      {(showSuggestions || isLoading) && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-card rounded-xl border z-99 max-h-96 overflow-y-auto">
          {isLoading && loadingComponent}

          {!isLoading && hasJellyfinResults && (
            <div className="p-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1 mb-1">
                Library
              </div>
              {suggestions.map((item) => (
                <SearchSuggestionItem
                  key={item.Id}
                  item={item}
                  onClick={() => handleSuggestionClick(item)}
                  formatRuntime={formatRuntime}
                />
              ))}
            </div>
          )}

          {/* TMDB results section */}
          {!isLoading && hasTmdbResults && (
            <>
              <div className="px-3 py-2 border-t">
                <p className="text-xs text-muted-foreground font-medium">
                  {hasJellyfinResults
                    ? "Not in your library"
                    : "Found on The Movie Database"}
                </p>
              </div>
              {tmdbSuggestions.slice(0, 5).map((item) => {
                const title = getTmdbTitle(item);
                const year = getTmdbYear(item);
                const mediaType = getTmdbMediaType(item);
                // Resolve image path across all result types
                const rawImagePath =
                  (item as any).poster_path ??
                  (item as any).profile_path ??
                  (item as any).logo_path ??
                  null;
                const posterUrl = rawImagePath ? tmdbPosterUrl(rawImagePath, "small") : null;
                const tracked = mediaType === "movie" || mediaType === "tv"
                  ? getRequestByTmdbId(item.id)
                  : null;
                const mediaTypeLabel =
                  mediaType === "movie" ? "Movie" :
                  mediaType === "tv" ? "TV Show" :
                  mediaType === "person" ? "Person" : "Studio";

                return (
                  <div
                    key={`tmdb-${item.id}`}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => handleTmdbItemClick(item)}
                  >
                    {posterUrl ? (
                      <img
                        src={posterUrl}
                        alt={title}
                        className="w-8 h-12 rounded object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-12 rounded bg-muted shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{title}</p>
                      <p className="text-xs text-muted-foreground">
                        {year ? `${year} · ` : ""}
                        {mediaTypeLabel}
                      </p>
                    </div>
                    {tracked ? (
                      <span className="text-xs text-muted-foreground capitalize">
                        {tracked.status.replace("-", " ")}
                      </span>
                    ) : (mediaType === "movie" || mediaType === "tv") ? (
                      <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : null}
                  </div>
                );
              })}
            </>
          )}

          {!isLoading &&
            !hasAnyResults &&
            searchQuery.trim().length > 2 && (
              <div className="p-4 text-center text-muted-foreground">
                <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No results found for &ldquo;{searchQuery}&rdquo;</p>
              </div>
            )}
        </div>
      )}

      <RequestSheet
        item={requestSheetItem}
        isOpen={!!requestSheetItem}
        onClose={() => setRequestSheetItem(null)}
        onRequestSubmitted={(request) => {
          addRequest(request);
          setRequestSheetItem(null);
        }}
      />
    </div>
  );
}

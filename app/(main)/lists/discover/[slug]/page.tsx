"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { PortraitCard, PortraitCardSkeleton } from "@/src/components/media/portrait-card";
import { MediaLink } from "@/src/components/media/media-link";
import { tmdbPosterUrl } from "@/src/lib/tmdb";
import type { TmdbMovie, TmdbTvShow } from "@/src/types/tmdb";
import { isTmdbMovie, getTmdbYear } from "@/src/types/tmdb";
import Link from "next/link";
import { ChevronLeft, Loader2 } from "lucide-react";

// ---------------------------------------------------------------------------
// List configs — maps slug to TMDB API params + display name
// ---------------------------------------------------------------------------

interface ListConfig {
  title: string;
  endpoint: string;
  params?: Record<string, string>;
  mediaType: "movie" | "tv" | "mixed";
}

const LIST_CONFIGS: Record<string, ListConfig> = {
  // Tier 1
  "new-arrivals": {
    title: "New Arrivals",
    endpoint: "/movie/now_playing",
    mediaType: "movie",
  },
  "fresh-series": {
    title: "Fresh Series",
    endpoint: "/tv/on_the_air",
    mediaType: "tv",
  },
  "hall-of-fame": {
    title: "Hall of Fame",
    endpoint: "/movie/top_rated",
    mediaType: "movie",
  },
  "editors-picks": {
    title: "Editor's Picks",
    endpoint: "/movie/popular",
    mediaType: "movie",
  },

  // Platform rows
  netflix: {
    title: "Netflix",
    endpoint: "/discover/movie",
    params: { with_watch_providers: "8", watch_region: "US", sort_by: "popularity.desc" },
    mediaType: "movie",
  },
  prime: {
    title: "Prime Video",
    endpoint: "/discover/movie",
    params: { with_watch_providers: "9", watch_region: "US", sort_by: "popularity.desc" },
    mediaType: "movie",
  },
  disney: {
    title: "Disney+",
    endpoint: "/discover/movie",
    params: { with_watch_providers: "337", watch_region: "US", sort_by: "popularity.desc" },
    mediaType: "movie",
  },
  hbo: {
    title: "HBO",
    endpoint: "/discover/movie",
    params: { with_watch_providers: "1899", watch_region: "US", sort_by: "popularity.desc" },
    mediaType: "movie",
  },
  hulu: {
    title: "Hulu",
    endpoint: "/discover/movie",
    params: { with_watch_providers: "15", watch_region: "US", sort_by: "popularity.desc" },
    mediaType: "movie",
  },

  // Genre rows
  action: {
    title: "Adrenaline Rush",
    endpoint: "/discover/movie",
    params: { with_genres: "28", sort_by: "popularity.desc" },
    mediaType: "movie",
  },
  thriller: {
    title: "Edge of Your Seat",
    endpoint: "/discover/movie",
    params: { with_genres: "53", sort_by: "popularity.desc" },
    mediaType: "movie",
  },
  comedy: {
    title: "Comedy Club",
    endpoint: "/discover/movie",
    params: { with_genres: "35", sort_by: "popularity.desc" },
    mediaType: "movie",
  },
  drama: {
    title: "The Stage",
    endpoint: "/discover/movie",
    params: { with_genres: "18", sort_by: "popularity.desc" },
    mediaType: "movie",
  },
  horror: {
    title: "After Dark",
    endpoint: "/discover/movie",
    params: { with_genres: "27", sort_by: "popularity.desc" },
    mediaType: "movie",
  },
  scifi: {
    title: "Beyond the Stars",
    endpoint: "/discover/movie",
    params: { with_genres: "878", sort_by: "popularity.desc" },
    mediaType: "movie",
  },
  war: {
    title: "Battlegrounds",
    endpoint: "/discover/movie",
    params: { with_genres: "10752", sort_by: "popularity.desc" },
    mediaType: "movie",
  },
  "crime-tv": {
    title: "Criminal Minds",
    endpoint: "/discover/tv",
    params: { with_genres: "80", sort_by: "popularity.desc" },
    mediaType: "tv",
  },
};

export { LIST_CONFIGS };

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

const INITIAL_SKELETON_COUNT = 20;
const LOAD_MORE_SKELETON_COUNT = 6;

export default function DiscoverListPage() {
  const { slug } = useParams<{ slug: string }>();
  const config = LIST_CONFIGS[slug];

  const [items, setItems] = useState<(TmdbMovie | TmdbTvShow)[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const isFetchingRef = useRef(false);
  const hasMorePages = currentPage < totalPages;

  const fetchPage = useCallback(
    async (page: number) => {
      if (!config) return { results: [], totalPages: 1 };
      const params = new URLSearchParams({ page: String(page), ...config.params });
      const response = await fetch(`/api/tmdb${config.endpoint}?${params}`);
      if (!response.ok) throw new Error(`TMDB returned ${response.status}`);
      const data = await response.json();
      return {
        results: (data.results ?? []) as (TmdbMovie | TmdbTvShow)[],
        totalPages: (data.total_pages ?? 1) as number,
      };
    },
    [config],
  );

  // Load page 1
  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    isFetchingRef.current = true;
    setIsInitialLoading(true);
    setItems([]);
    setCurrentPage(1);

    fetchPage(1)
      .then(({ results, totalPages: total }) => {
        if (cancelled) return;
        setItems(results);
        setTotalPages(total);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) {
          setIsInitialLoading(false);
          isFetchingRef.current = false;
        }
      });

    return () => {
      cancelled = true;
    };
  }, [config, fetchPage]);

  // Infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || isFetchingRef.current) return;

        setCurrentPage((prev) => {
          setTotalPages((totalSnapshot) => {
            if (prev >= totalSnapshot) return totalSnapshot;
            const nextPage = prev + 1;
            isFetchingRef.current = true;
            setIsFetchingMore(true);

            fetchPage(nextPage)
              .then(({ results, totalPages: total }) => {
                setItems((existing) => {
                  const seenIds = new Set(existing.map((m) => m.id));
                  return [...existing, ...results.filter((m) => !seenIds.has(m.id))];
                });
                setCurrentPage(nextPage);
                setTotalPages(total);
              })
              .catch(() => {})
              .finally(() => {
                isFetchingRef.current = false;
                setIsFetchingMore(false);
              });

            return totalSnapshot;
          });
          return prev;
        });
      },
      { threshold: 0.1 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchPage]);

  if (!config) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">List not found</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div className="relative z-10 mx-auto flex w-full max-w-[2400px] flex-col gap-8 px-6 pt-20 pb-24 md:px-12 lg:px-16">
        {/* Header */}
        <div className="flex flex-col gap-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Home
          </Link>

          <h1 className="text-foreground text-3xl font-black tracking-tight md:text-4xl">
            {config.title}
          </h1>

          {!isInitialLoading && (
            <p className="text-sm text-muted-foreground">
              {items.length} titles loaded
            </p>
          )}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7">
          {isInitialLoading
            ? Array.from({ length: INITIAL_SKELETON_COUNT }).map((_, i) => (
                <PortraitCardSkeleton key={i} />
              ))
            : items.map((item) => {
                const isMovie = isTmdbMovie(item);
                const title = isMovie ? item.title : item.name;
                const mediaType = isMovie ? "movie" : "tv";
                return (
                  <MediaLink key={item.id} id={item.id} mediaType={mediaType}>
                    <PortraitCard
                      title={title}
                      subtitle={getTmdbYear(item) ?? null}
                      posterUrl={tmdbPosterUrl(item.poster_path, "medium")}
                    />
                  </MediaLink>
                );
              })}

          {isFetchingMore &&
            Array.from({ length: LOAD_MORE_SKELETON_COUNT }).map((_, i) => (
              <PortraitCardSkeleton key={`more-${i}`} />
            ))}
        </div>

        <div ref={sentinelRef} className="h-4" />

        {isFetchingMore && (
          <div className="flex justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isInitialLoading && !isFetchingMore && !hasMorePages && items.length > 0 && (
          <p className="text-center text-sm text-muted-foreground py-4">
            All {items.length} titles loaded
          </p>
        )}
      </div>
    </div>
  );
}

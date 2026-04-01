"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { PortraitCard, PortraitCardSkeleton } from "@/src/components/media/portrait-card";
import Link from "next/link";
import { ChevronLeft, Loader2 } from "lucide-react";

const INITIAL_SKELETON_COUNT = 20;
const LOAD_MORE_SKELETON_COUNT = 6;

interface NormalizedAnilistItem {
  id: number;
  title: string;
  poster_path: string | null;
  media_type: "tv";
  year: number | null;
  indexer: "anilist";
}

export default function TrendingAnimePage() {
  const [animeList, setAnimeList] = useState<NormalizedAnilistItem[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const isFetchingRef = useRef(false);

  const fetchPage = useCallback(async (page: number) => {
    const response = await fetch(`/api/anilist/trending?page=${page}`);
    if (!response.ok) throw new Error(`AniList returned ${response.status}`);
    const data = await response.json();
    return {
      items: (data.items ?? []) as NormalizedAnilistItem[],
      hasNextPage: (data.hasNextPage ?? false) as boolean,
    };
  }, []);

  // Load page 1 on mount
  useEffect(() => {
    let cancelled = false;
    isFetchingRef.current = true;

    fetchPage(1)
      .then(({ items, hasNextPage: moreAvailable }) => {
        if (cancelled) return;
        setAnimeList(items);
        setCurrentPage(1);
        setHasNextPage(moreAvailable);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load trending anime.");
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
  }, [fetchPage]);

  // IntersectionObserver — load next page when sentinel comes into view
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        if (isFetchingRef.current) return;

        setCurrentPage((prev) => {
          setHasNextPage((hasMore) => {
            if (!hasMore) return hasMore;

            const nextPage = prev + 1;
            isFetchingRef.current = true;
            setIsFetchingMore(true);

            fetchPage(nextPage)
              .then(({ items, hasNextPage: moreAvailable }) => {
                setAnimeList((existing) => {
                  const seenIds = new Set(existing.map((a) => a.id));
                  const uniqueItems = items.filter((a) => !seenIds.has(a.id));
                  return [...existing, ...uniqueItems];
                });
                setCurrentPage(nextPage);
                setHasNextPage(moreAvailable);
              })
              .catch(() => {
                // Page fetch failed — don't advance currentPage so retry is possible
              })
              .finally(() => {
                isFetchingRef.current = false;
                setIsFetchingMore(false);
              });

            return hasMore;
          });
          return prev;
        });
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchPage]);

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-900 via-zinc-950 to-black" />
        <div className="absolute top-[-20%] left-[-10%] h-[600px] w-[600px] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute right-[-5%] bottom-[-10%] h-[500px] w-[500px] rounded-full bg-blue-500/5 blur-[100px]" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-[2400px] flex-col gap-8 px-6 pt-6 pb-24 md:px-12 md:pt-12 lg:px-16">
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
            Trending Anime
          </h1>

          {!isInitialLoading && !error && (
            <p className="text-sm text-muted-foreground">
              {animeList.length} titles loaded from AniList
            </p>
          )}
        </div>

        {/* Error state */}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-red-400">
            {error}
          </div>
        )}

        {/* Grid */}
        {!error && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7">
            {isInitialLoading
              ? Array.from({ length: INITIAL_SKELETON_COUNT }).map((_, i) => (
                  <PortraitCardSkeleton key={i} />
                ))
              : animeList.map((anime) => (
                  <PortraitCard
                    key={anime.id}
                    title={anime.title}
                    subtitle={anime.year ? String(anime.year) : null}
                    posterUrl={anime.poster_path}
                  />
                ))}

            {isFetchingMore &&
              Array.from({ length: LOAD_MORE_SKELETON_COUNT }).map((_, i) => (
                <PortraitCardSkeleton key={`more-${i}`} />
              ))}
          </div>
        )}

        {/* Sentinel div for IntersectionObserver */}
        <div ref={sentinelRef} className="h-4" />

        {/* Bottom loading indicator */}
        {isFetchingMore && (
          <div className="flex justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isInitialLoading && !isFetchingMore && !hasNextPage && animeList.length > 0 && (
          <p className="text-center text-sm text-muted-foreground py-4">
            All {animeList.length} titles loaded
          </p>
        )}
      </div>
    </div>
  );
}

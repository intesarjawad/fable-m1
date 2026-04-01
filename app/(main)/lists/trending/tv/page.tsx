"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { PortraitCard, PortraitCardSkeleton } from "@/src/components/media/portrait-card";
import { MediaLink } from "@/src/components/media/media-link";
import { TogglePill } from "@/src/components/media/toggle-pill";
import { tmdbPosterUrl } from "@/src/lib/tmdb";
import type { TmdbTvShow } from "@/src/types/tmdb";
import { getTmdbYear } from "@/src/types/tmdb";
import Link from "next/link";
import { ChevronLeft, Loader2 } from "lucide-react";

type TrendingTimeWindow = "Today" | "This Week";

const INITIAL_SKELETON_COUNT = 20;
const LOAD_MORE_SKELETON_COUNT = 6;

export default function TrendingTvPage() {
  const [shows, setShows] = useState<TmdbTvShow[]>([]);
  const [timeWindow, setTimeWindow] = useState<TrendingTimeWindow>("This Week");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const activeTimeWindowRef = useRef<TrendingTimeWindow>("This Week");
  const isFetchingRef = useRef(false);

  const hasMorePages = currentPage < totalPages;

  const fetchPage = useCallback(async (window: TrendingTimeWindow, page: number) => {
    const apiWindow = window === "Today" ? "day" : "week";
    const response = await fetch(
      `/api/tmdb/trending/tv/${apiWindow}?page=${page}`
    );
    if (!response.ok) throw new Error(`TMDB returned ${response.status}`);
    const data = await response.json();
    return {
      results: (data.results ?? []) as TmdbTvShow[],
      totalPages: (data.total_pages ?? 1) as number,
    };
  }, []);

  // Load page 1 whenever the time window changes
  useEffect(() => {
    let cancelled = false;
    activeTimeWindowRef.current = timeWindow;
    isFetchingRef.current = true;
    setIsInitialLoading(true);
    setShows([]);
    setCurrentPage(1);
    setTotalPages(1);

    fetchPage(timeWindow, 1)
      .then(({ results, totalPages: total }) => {
        if (cancelled) return;
        setShows(results);
        setCurrentPage(1);
        setTotalPages(total);
      })
      .catch(() => {
        if (!cancelled) setShows([]);
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
  }, [timeWindow, fetchPage]);

  // IntersectionObserver — load next page when sentinel comes into view
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        if (isFetchingRef.current) return;

        setCurrentPage((prev) => {
          setTotalPages((totalPagesSnapshot) => {
            if (prev >= totalPagesSnapshot) return totalPagesSnapshot;

            const nextPage = prev + 1;
            const windowAtTriggerTime = activeTimeWindowRef.current;
            isFetchingRef.current = true;
            setIsFetchingMore(true);

            fetchPage(windowAtTriggerTime, nextPage)
              .then(({ results, totalPages: total }) => {
                if (activeTimeWindowRef.current !== windowAtTriggerTime) return;
                setShows((existing) => {
                  const seenIds = new Set(existing.map((s) => s.id));
                  const uniqueResults = results.filter((s) => !seenIds.has(s.id));
                  return [...existing, ...uniqueResults];
                });
                setCurrentPage(nextPage);
                setTotalPages(total);
              })
              .catch(() => {
                // Page fetch failed — don't advance currentPage so retry is possible
              })
              .finally(() => {
                isFetchingRef.current = false;
                setIsFetchingMore(false);
              });

            return totalPagesSnapshot;
          });
          return prev;
        });
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchPage]);

  const handleTimeWindowChange = (selected: string) => {
    setTimeWindow(selected as TrendingTimeWindow);
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-900 via-zinc-950 to-black" />
        <div className="absolute top-[-20%] left-[-10%] h-[600px] w-[600px] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute right-[-5%] bottom-[-10%] h-[500px] w-[500px] rounded-full bg-blue-500/5 blur-[100px]" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-[2400px] flex-col gap-8 px-6 pt-20 pb-24 md:px-12 md:pt-20 lg:px-16">
        {/* Header */}
        <div className="flex flex-col gap-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Home
          </Link>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-foreground text-3xl font-black tracking-tight md:text-4xl">
              Trending TV Shows
            </h1>
            <TogglePill
              options={["Today", "This Week"]}
              value={timeWindow}
              onChange={handleTimeWindowChange}
            />
          </div>

          {!isInitialLoading && (
            <p className="text-sm text-muted-foreground">
              {shows.length} titles loaded
            </p>
          )}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7">
          {isInitialLoading
            ? Array.from({ length: INITIAL_SKELETON_COUNT }).map((_, i) => (
                <PortraitCardSkeleton key={i} />
              ))
            : shows.map((show) => (
                <MediaLink key={show.id} id={show.id} mediaType="tv">
                  <PortraitCard
                    title={show.name}
                    subtitle={getTmdbYear(show) ?? null}
                    posterUrl={tmdbPosterUrl(show.poster_path, "medium")}
                  />
                </MediaLink>
              ))}

          {isFetchingMore &&
            Array.from({ length: LOAD_MORE_SKELETON_COUNT }).map((_, i) => (
              <PortraitCardSkeleton key={`more-${i}`} />
            ))}
        </div>

        {/* Sentinel div for IntersectionObserver */}
        <div ref={sentinelRef} className="h-4" />

        {/* Bottom loading indicator */}
        {isFetchingMore && (
          <div className="flex justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isInitialLoading && !isFetchingMore && !hasMorePages && shows.length > 0 && (
          <p className="text-center text-sm text-muted-foreground py-4">
            All {shows.length} titles loaded
          </p>
        )}
      </div>
    </div>
  );
}

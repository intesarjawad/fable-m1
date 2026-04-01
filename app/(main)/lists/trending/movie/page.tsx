"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { fetchTrendingMovies } from "@/src/actions/tmdb";
import { PortraitCard } from "@/src/components/media/portrait-card";
import { PortraitCardSkeleton } from "@/src/components/media/portrait-card";
import { MediaLink } from "@/src/components/media/media-link";
import { TogglePill } from "@/src/components/media/toggle-pill";
import { tmdbPosterUrl } from "@/src/lib/tmdb";
import type { TmdbMovie } from "@/src/types/tmdb";
import { getTmdbYear } from "@/src/types/tmdb";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

type TrendingTimeWindow = "Today" | "This Week";

const SKELETON_COUNT = 20;

export default function TrendingMoviesPage() {
  const [movies, setMovies] = useState<TmdbMovie[]>([]);
  const [timeWindow, setTimeWindow] = useState<TrendingTimeWindow>("This Week");
  const [isLoading, setIsLoading] = useState(true);

  const loadMovies = useCallback(async (window: TrendingTimeWindow) => {
    setIsLoading(true);
    try {
      const apiWindow = window === "Today" ? "day" : "week";
      const results = await fetchTrendingMovies(apiWindow);
      setMovies(results);
    } catch {
      setMovies([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMovies(timeWindow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadMovies]);

  const handleTimeWindowChange = (selected: string) => {
    const newWindow = selected as TrendingTimeWindow;
    setTimeWindow(newWindow);
    loadMovies(newWindow);
  };

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

          <div className="flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-foreground text-3xl font-black tracking-tight md:text-4xl">
              Trending Movies
            </h1>
            <TogglePill
              options={["Today", "This Week"]}
              value={timeWindow}
              onChange={handleTimeWindowChange}
            />
          </div>

          {!isLoading && (
            <p className="text-sm text-muted-foreground">
              {movies.length} titles
            </p>
          )}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7">
          {isLoading
            ? Array.from({ length: SKELETON_COUNT }).map((_, i) => (
                <PortraitCardSkeleton key={i} />
              ))
            : movies.map((movie) => (
                <MediaLink key={movie.id} id={movie.id} mediaType="movie">
                  <PortraitCard
                    title={movie.title}
                    subtitle={getTmdbYear(movie) ?? null}
                    posterUrl={tmdbPosterUrl(movie.poster_path, "medium")}
                  />
                </MediaLink>
              ))}
        </div>
      </div>
    </div>
  );
}

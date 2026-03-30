"use client";

import { useState, useEffect, useCallback } from "react";
import { AuroraBackground } from "@/src/components/aurora-background";
import { SearchBar } from "@/src/components/search-component";
import { DiscoverHero } from "@/src/components/discover/discover-hero";
import { GenreFilterBar } from "@/src/components/discover/genre-filter-bar";
import { DiscoverSections } from "@/src/components/discover/discover-sections";
import {
  isTmdbConfigured,
  fetchTrendingMovies,
  fetchTrendingTv,
} from "@/src/actions/tmdb";
import { requestMovie } from "@/src/actions/request";
import { useRequestState } from "@/src/hooks/use-request-state";
import { RequestSheet } from "@/src/components/request-sheet";
import type {
  TmdbMediaItem,
  TmdbMovie,
  TmdbTvShow,
  TrackedRequest,
} from "@/src/types/tmdb";
import { isTmdbMovie } from "@/src/types/tmdb";
import { toast } from "sonner";
import { Settings2 } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/src/components/ui/skeleton";

export default function DiscoverPage() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [heroItem, setHeroItem] = useState<TmdbMediaItem | null>(null);
  const [selectedGenreId, setSelectedGenreId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const { addRequest } = useRequestState();
  const [sheetItem, setSheetItem] = useState<TmdbTvShow | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    async function initialize() {
      const isConfigured = await isTmdbConfigured();
      setConfigured(isConfigured);

      if (!isConfigured) {
        setLoading(false);
        return;
      }

      const [trendingMovies, trendingTv] = await Promise.all([
        fetchTrendingMovies(),
        fetchTrendingTv(),
      ]);

      // Pick the most popular trending item as the hero
      const allTrending = [...trendingMovies, ...trendingTv].sort(
        (a, b) => b.popularity - a.popularity
      );

      if (allTrending.length > 0) {
        setHeroItem(allTrending[0]);
      }

      setLoading(false);
    }

    initialize();
  }, []);

  const handleRequestMovie = useCallback(
    async (movie: TmdbMovie) => {
      const tracked: TrackedRequest = {
        tmdbId: movie.id,
        mediaType: "movie",
        title: movie.title,
        posterPath: movie.poster_path,
        requestedAt: new Date().toISOString(),
        status: "requested",
      };
      addRequest(tracked);
      toast.success(`${movie.title} requested`);

      const result = await requestMovie(movie.id);
      if (!result.success) {
        toast.error(result.message);
      }
    },
    [addRequest]
  );

  const handleRequestTvShow = useCallback((show: TmdbTvShow) => {
    setSheetItem(show);
    setSheetOpen(true);
  }, []);

  const handleSheetClose = useCallback(() => {
    setSheetOpen(false);
    setSheetItem(null);
  }, []);

  const handleSheetSubmitted = useCallback(
    (request: TrackedRequest) => {
      addRequest(request);
    },
    [addRequest]
  );

  // Loading state
  if (loading) {
    return (
      <div className="relative px-4 py-3 max-w-full overflow-hidden">
        <AuroraBackground />
        <div className="relative z-10 mb-8">
          <SearchBar />
        </div>
        <Skeleton className="h-[50vh] min-h-[300px] w-full rounded-xl" />
        <div className="mt-6">
          <Skeleton className="h-10 w-full rounded-full" />
        </div>
      </div>
    );
  }

  // TMDB not configured
  if (configured === false) {
    return (
      <div className="relative px-4 py-3 max-w-full overflow-hidden">
        <AuroraBackground />
        <div className="relative z-10 mb-8">
          <SearchBar />
        </div>
        <div className="relative z-10 flex flex-col items-center justify-center gap-4 py-24 text-center">
          <Settings2 className="h-12 w-12 text-muted-foreground" />
          <h2 className="text-xl font-semibold text-foreground">
            Content discovery is not configured
          </h2>
          <p className="text-muted-foreground max-w-md">
            Set up your TMDB API key to browse trending movies and TV shows.
          </p>
          <Link
            href="/settings"
            className="text-primary hover:underline text-sm font-medium"
          >
            Go to Settings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative max-w-full overflow-hidden">
      <AuroraBackground />

      <div className="relative z-10 px-4 py-3">
        <div className="mb-6">
          <SearchBar />
        </div>
      </div>

      <div className="relative z-10">
        <DiscoverHero
          item={heroItem}
          onRequestMovie={handleRequestMovie}
          onRequestTvShow={handleRequestTvShow}
        />
      </div>

      <div className="relative z-10 px-4">
        <GenreFilterBar
          selectedGenreId={selectedGenreId}
          onGenreSelect={setSelectedGenreId}
        />

        <DiscoverSections selectedGenreId={selectedGenreId} />
      </div>

      <RequestSheet
        item={sheetItem}
        isOpen={sheetOpen}
        onClose={handleSheetClose}
        onRequestSubmitted={handleSheetSubmitted}
      />
    </div>
  );
}

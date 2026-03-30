"use client";

import { useEffect, useState } from "react";
import { DiscoverySection } from "@/src/components/discovery-section";
import {
  fetchTrendingMovies,
  fetchTrendingTv,
  fetchPopularMovies,
  fetchPopularTv,
  fetchTopRatedMovies,
  fetchTopRatedTv,
  fetchDiscoverMovies,
  fetchDiscoverTv,
} from "@/src/actions/tmdb";
import type { TmdbMediaItem } from "@/src/types/tmdb";
import { TrendingUp, Flame, Star, Clapperboard } from "lucide-react";
import { Skeleton } from "@/src/components/ui/skeleton";

interface DiscoverSectionsProps {
  selectedGenreId: number | null;
}

interface SectionData {
  sectionName: string;
  items: TmdbMediaItem[];
  icon: React.ReactNode;
}

const MAX_ITEMS_PER_SECTION = 20;

function SkeletonRow() {
  return (
    <div className="mb-8">
      <Skeleton className="h-7 w-48 mb-6" />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 7 }).map((_, index) => (
          <Skeleton
            key={index}
            className="shrink-0 w-36 aspect-[2/3] rounded-md"
          />
        ))}
      </div>
    </div>
  );
}

export function DiscoverSections({ selectedGenreId }: DiscoverSectionsProps) {
  const [sections, setSections] = useState<SectionData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadSections() {
      setLoading(true);

      if (selectedGenreId === null) {
        // Default view: trending, popular movies, popular TV, top rated
        const [trendingMovies, trendingTv, popularMovies, popularTv, topMovies, topTv] =
          await Promise.all([
            fetchTrendingMovies(),
            fetchTrendingTv(),
            fetchPopularMovies(),
            fetchPopularTv(),
            fetchTopRatedMovies(),
            fetchTopRatedTv(),
          ]);

        if (cancelled) return;

        const trendingMixed = [...trendingMovies, ...trendingTv]
          .sort((a, b) => b.popularity - a.popularity)
          .slice(0, MAX_ITEMS_PER_SECTION);

        const topRatedMixed = [...topMovies, ...topTv]
          .sort((a, b) => b.vote_average - a.vote_average)
          .slice(0, MAX_ITEMS_PER_SECTION);

        setSections([
          {
            sectionName: "Trending Now",
            items: trendingMixed,
            icon: <TrendingUp className="h-6 w-6 text-emerald-400" />,
          },
          {
            sectionName: "Popular Movies",
            items: popularMovies.slice(0, MAX_ITEMS_PER_SECTION),
            icon: <Flame className="h-6 w-6 text-orange-400" />,
          },
          {
            sectionName: "Popular TV Shows",
            items: popularTv.slice(0, MAX_ITEMS_PER_SECTION),
            icon: <Flame className="h-6 w-6 text-rose-400" />,
          },
          {
            sectionName: "Top Rated",
            items: topRatedMixed,
            icon: <Star className="h-6 w-6 text-yellow-400" />,
          },
        ]);
      } else {
        // Genre-filtered view
        const [movieResults, tvResults] = await Promise.all([
          fetchDiscoverMovies(selectedGenreId),
          fetchDiscoverTv(selectedGenreId),
        ]);

        if (cancelled) return;

        const discoveredMovies = movieResults?.results ?? [];
        const discoveredTvShows = tvResults?.results ?? [];

        const filteredSections: SectionData[] = [];

        if (discoveredMovies.length > 0) {
          filteredSections.push({
            sectionName: "Movies",
            items: discoveredMovies.slice(0, MAX_ITEMS_PER_SECTION),
            icon: <Clapperboard className="h-6 w-6 text-blue-400" />,
          });
        }

        if (discoveredTvShows.length > 0) {
          filteredSections.push({
            sectionName: "TV Shows",
            items: discoveredTvShows.slice(0, MAX_ITEMS_PER_SECTION),
            icon: <Clapperboard className="h-6 w-6 text-purple-400" />,
          });
        }

        setSections(filteredSections);
      }

      setLoading(false);
    }

    loadSections();

    return () => {
      cancelled = true;
    };
  }, [selectedGenreId]);

  if (loading) {
    return (
      <div className="mt-6">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="mt-12 text-center text-muted-foreground">
        No results found for this genre.
      </div>
    );
  }

  return (
    <div className="mt-6">
      {sections.map((section) => (
        <DiscoverySection
          key={section.sectionName}
          sectionName={section.sectionName}
          items={section.items}
          icon={section.icon}
        />
      ))}
    </div>
  );
}

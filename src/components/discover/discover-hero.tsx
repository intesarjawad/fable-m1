"use client";

import { OptimizedImage } from "@/src/components/optimized-image";
import { Button } from "@/src/components/ui/button";
import { tmdbBackdropUrl } from "@/src/lib/tmdb";
import {
  getTmdbTitle,
  getTmdbYear,
  isTmdbMovie,
  isTmdbTvShow,
} from "@/src/types/tmdb";
import type { TmdbMediaItem, TmdbMovie, TmdbTvShow } from "@/src/types/tmdb";
import { useJellyfinTmdbMap } from "@/src/hooks/use-jellyfin-tmdb-map";
import { Play, Plus, Star } from "lucide-react";
import Link from "next/link";

interface DiscoverHeroProps {
  item: TmdbMediaItem | null;
  onRequestMovie: (item: TmdbMovie) => void;
  onRequestTvShow: (item: TmdbTvShow) => void;
}

const OVERVIEW_MAX_LENGTH = 200;

export function DiscoverHero({
  item,
  onRequestMovie,
  onRequestTvShow,
}: DiscoverHeroProps) {
  const { tmdbMap } = useJellyfinTmdbMap();

  if (!item) return null;

  const title = getTmdbTitle(item);
  const year = getTmdbYear(item);
  const backdropUrl = tmdbBackdropUrl(item.backdrop_path, "original");
  const jellyfinMatch = tmdbMap.get(item.id);
  const isInLibrary = Boolean(jellyfinMatch);

  const truncatedOverview =
    item.overview.length > OVERVIEW_MAX_LENGTH
      ? `${item.overview.slice(0, OVERVIEW_MAX_LENGTH).trimEnd()}...`
      : item.overview;

  // Capture the narrowed non-null item for use in closures
  const currentItem = item;

  function handleAction() {
    if (isInLibrary) return; // Link handles navigation
    if (isTmdbMovie(currentItem)) {
      onRequestMovie(currentItem);
    } else if (isTmdbTvShow(currentItem)) {
      onRequestTvShow(currentItem);
    }
  }

  const actionButton = isInLibrary && jellyfinMatch ? (
    <Button asChild size="lg" className="gap-2">
      <Link
        href={
          jellyfinMatch.type === "Movie"
            ? `/movie/${jellyfinMatch.jellyfinId}`
            : `/series/${jellyfinMatch.jellyfinId}`
        }
      >
        <Play className="h-5 w-5" />
        Watch Now
      </Link>
    </Button>
  ) : (
    <Button size="lg" variant="secondary" className="gap-2" onClick={handleAction}>
      <Plus className="h-5 w-5" />
      Add to Library
    </Button>
  );

  return (
    <div className="relative h-[50vh] min-h-[300px] w-full overflow-hidden rounded-xl">
      {backdropUrl && (
        <OptimizedImage
          src={backdropUrl}
          alt={title}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />

      {/* Content positioned at bottom-left */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-6 md:p-10 md:max-w-2xl">
        <h1 className="text-3xl font-bold text-foreground md:text-4xl font-poppins leading-tight">
          {title}
        </h1>

        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {year && <span>{year}</span>}
          {item.vote_average > 0 && (
            <span className="flex items-center gap-1 rounded-md bg-yellow-500/20 px-2 py-0.5 text-yellow-400">
              <Star className="h-3.5 w-3.5 fill-yellow-400" />
              {item.vote_average.toFixed(1)}
            </span>
          )}
        </div>

        {truncatedOverview && (
          <p className="text-sm text-muted-foreground/90 line-clamp-3 leading-relaxed">
            {truncatedOverview}
          </p>
        )}

        <div className="mt-1">{actionButton}</div>
      </div>
    </div>
  );
}

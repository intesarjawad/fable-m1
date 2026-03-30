"use client";
import React, { useCallback, useMemo } from "react";
import type {
  TmdbMediaItem,
  TmdbMovie,
  TmdbTvShow,
  TrackedRequest,
  RequestStatus,
} from "@/src/types/tmdb";
import {
  getTmdbTitle,
  getTmdbYear,
  getTmdbMediaType,
  isTmdbMovie,
  isTmdbTvShow,
} from "@/src/types/tmdb";
import { OptimizedImage } from "./optimized-image";
import { tmdbPosterUrl } from "@/src/lib/tmdb";
import { Play, Plus } from "lucide-react";
import Link from "next/link";

interface DiscoveryCardProps {
  item: TmdbMediaItem;
  jellyfinMatch?: { jellyfinId: string; type: string };
  trackedRequest?: TrackedRequest;
  onRequestMovie: (item: TmdbMovie) => void;
  onRequestTvShow: (item: TmdbTvShow) => void;
}

const STATUS_BADGE_STYLES: Record<RequestStatus, { className: string; label: string }> = {
  requested: { className: "bg-sky-500/70 backdrop-blur-sm", label: "Requested" },
  "getting-ready": { className: "bg-amber-500/70 backdrop-blur-sm", label: "Getting Ready" },
  ready: { className: "bg-emerald-500/70 backdrop-blur-sm", label: "Ready" },
  failed: { className: "bg-red-500/70 backdrop-blur-sm", label: "Failed" },
};

export const DiscoveryCard = React.memo(function DiscoveryCard({
  item,
  jellyfinMatch,
  trackedRequest,
  onRequestMovie,
  onRequestTvShow,
}: DiscoveryCardProps) {
  const title = getTmdbTitle(item);
  const year = getTmdbYear(item);
  const mediaType = getTmdbMediaType(item);
  const posterSrc = tmdbPosterUrl(item.poster_path, "medium");

  const isInLibrary = Boolean(jellyfinMatch);
  const isRequested = Boolean(trackedRequest);

  const linkHref = useMemo(() => {
    if (!jellyfinMatch) return undefined;
    return jellyfinMatch.type === "Movie"
      ? `/movie/${jellyfinMatch.jellyfinId}`
      : `/series/${jellyfinMatch.jellyfinId}`;
  }, [jellyfinMatch]);

  const handleActionClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (isInLibrary || isRequested) return;

      if (isTmdbMovie(item)) {
        onRequestMovie(item);
      } else if (isTmdbTvShow(item)) {
        onRequestTvShow(item);
      }
    },
    [isInLibrary, isRequested, item, onRequestMovie, onRequestTvShow],
  );

  const mediaTypeBadgeLabel = mediaType === "tv" ? "TV" : "Movie";

  const cardContent = (
    <div className="cursor-pointer group overflow-hidden transition select-none w-36">
      <div className="relative w-full border rounded-md overflow-hidden active:scale-[0.98] transition aspect-[2/3]">
        {/* Poster image */}
        {posterSrc ? (
          <OptimizedImage
            src={posterSrc}
            alt={title}
            className="w-full h-full object-cover transition-opacity duration-300 shadow-lg group-hover:shadow-md rounded-md"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full bg-gray-800 flex items-center justify-center rounded-md shadow-lg">
            <div className="text-white/60 text-sm">No Image</div>
          </div>
        )}

        {/* Media type badge — top left */}
        <div className="absolute top-2 left-2 bg-black/60 text-white border border-white/20 backdrop-blur-md text-[10px] font-bold px-2 py-0.5 h-6 rounded-md uppercase tracking-wide flex items-center">
          {mediaTypeBadgeLabel}
        </div>

        {/* Status badge — top right (only when tracked) */}
        {trackedRequest && (
          <div
            className={`absolute top-2 right-2 text-[10px] text-white px-2 py-0.5 rounded-md ${STATUS_BADGE_STYLES[trackedRequest.status].className}`}
          >
            {STATUS_BADGE_STYLES[trackedRequest.status].label}
          </div>
        )}

        {/* Hover overlay — Play icon for library items, Plus icon for unrequested */}
        {!isRequested && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-300 flex items-center justify-center pointer-events-none rounded-md">
            <div className="invisible group-hover:visible transition-opacity duration-300 pointer-events-auto">
              <button
                onClick={isInLibrary ? undefined : handleActionClick}
                className="bg-white/20 backdrop-blur-sm rounded-full p-3 hover:bg-white/30 transition active:scale-[0.97] hover:cursor-pointer"
              >
                {isInLibrary ? (
                  <Play className="h-6 w-6 text-white fill-white" />
                ) : (
                  <Plus className="h-6 w-6 text-white" />
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Title and year */}
      <div className="px-1">
        <div className="mt-2.5 text-sm font-medium text-foreground truncate group-hover:underline">
          {title}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">{year}</div>
      </div>
    </div>
  );

  // Wrap in Link only when we have a Jellyfin destination
  if (linkHref) {
    return (
      <Link href={linkHref} draggable={false}>
        {cardContent}
      </Link>
    );
  }

  return cardContent;
});

DiscoveryCard.displayName = "DiscoveryCard";

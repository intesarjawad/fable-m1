"use client";

import { Button } from "./ui/button";
import { OptimizedImage } from "./optimized-image";
import { tmdbPosterUrl } from "@/src/lib/tmdb";
import Link from "next/link";

interface RequestCompleteToastProps {
  title: string;
  year?: number;
  posterPath: string | null;
  jellyfinId?: string;
  mediaType: "movie" | "show";
  onDismiss: () => void;
}

export function RequestCompleteToast({
  title,
  year,
  posterPath,
  jellyfinId,
  mediaType,
  onDismiss,
}: RequestCompleteToastProps) {
  const detailPath = jellyfinId
    ? mediaType === "movie"
      ? `/movie/${jellyfinId}`
      : `/series/${jellyfinId}`
    : undefined;

  return (
    <div className="flex items-center gap-3 w-full">
      {posterPath && (
        <OptimizedImage
          src={tmdbPosterUrl(posterPath, "small") ?? ""}
          alt={title}
          className="w-10 h-[60px] rounded-md object-cover shrink-0"
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{title}</p>
        <p className="text-xs text-muted-foreground">
          {year ? `${year} \u00b7 ` : ""}Ready to watch
        </p>
      </div>
      {detailPath ? (
        <Button size="sm" asChild onClick={onDismiss}>
          <Link href={detailPath}>Watch</Link>
        </Button>
      ) : (
        <Button size="sm" variant="outline" onClick={onDismiss}>
          Dismiss
        </Button>
      )}
    </div>
  );
}

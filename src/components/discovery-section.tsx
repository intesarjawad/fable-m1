"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { Button } from "./ui/button";
import { ScrollArea, ScrollBar } from "./ui/scroll-area";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DiscoveryCard } from "./discovery-card";
import { RequestSheet } from "./request-sheet";
import { useJellyfinTmdbMap } from "@/src/hooks/use-jellyfin-tmdb-map";
import { useRequestState } from "@/src/hooks/use-request-state";
import { requestMovie } from "@/src/actions/request";
import { toast } from "sonner";
import type {
  TmdbMediaItem,
  TmdbMovie,
  TmdbTvShow,
  TrackedRequest,
} from "@/src/types/tmdb";
import { getTmdbTitle, isTmdbMovie } from "@/src/types/tmdb";

interface DiscoverySectionProps {
  sectionName: string;
  items: TmdbMediaItem[];
  icon?: React.ReactNode;
}

export function DiscoverySection({
  sectionName,
  items,
  icon,
}: DiscoverySectionProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const { tmdbMap } = useJellyfinTmdbMap();
  const { addRequest, getRequestByTmdbId } = useRequestState();

  const [sheetItem, setSheetItem] = useState<TmdbTvShow | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (scrollRef.current) {
      const viewport = scrollRef.current
        .closest('[data-slot="scroll-area"]')
        ?.querySelector(
          '[data-slot="scroll-area-viewport"]'
        ) as HTMLDivElement;
      if (viewport) {
        viewportRef.current = viewport;
      }
    }
  }, []);

  const scrollLeft = () => {
    viewportRef.current?.scrollBy({ left: -300, behavior: "smooth" });
  };

  const scrollRight = () => {
    viewportRef.current?.scrollBy({ left: 300, behavior: "smooth" });
  };

  const handleRequestMovie = useCallback(
    async (movie: TmdbMovie) => {
      const result = await requestMovie(movie.id);
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      addRequest({
        tmdbId: movie.id,
        mediaType: "movie",
        title: movie.title,
        posterPath: movie.poster_path,
        requestedAt: new Date().toISOString(),
        status: "requested",
      });
      toast.success(`${movie.title} requested`);
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

  if (items.length === 0) return null;

  return (
    <section className="relative z-10 mb-8">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-2xl font-semibold text-foreground font-poppins flex items-center gap-2">
          {icon}
          {sectionName}
        </h3>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="bg-background/10 border-border text-foreground hover:bg-accent p-2"
            onClick={scrollLeft}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="bg-background/10 border-border text-foreground hover:bg-accent p-2"
            onClick={scrollRight}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="w-full pb-6">
        <div className="flex gap-4 w-max h-fit" ref={scrollRef}>
          {items.map((item) => {
            const tmdbId = item.id;
            const jellyfinMatch = tmdbMap.get(tmdbId);
            const trackedRequest = getRequestByTmdbId(tmdbId);

            return (
              <div key={`${isTmdbMovie(item) ? "movie" : "tv"}-${tmdbId}`} className="shrink-0">
                <DiscoveryCard
                  item={item}
                  jellyfinMatch={jellyfinMatch}
                  trackedRequest={trackedRequest}
                  onRequestMovie={handleRequestMovie}
                  onRequestTvShow={handleRequestTvShow}
                />
              </div>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      <RequestSheet
        item={sheetItem}
        isOpen={sheetOpen}
        onClose={handleSheetClose}
        onRequestSubmitted={handleSheetSubmitted}
      />
    </section>
  );
}

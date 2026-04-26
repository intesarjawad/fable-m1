"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from "./ui/sheet";
import { Button } from "./ui/button";
import { OptimizedImage } from "./optimized-image";
import { tmdbPosterUrl } from "@/src/lib/tmdb";
import { getTmdbYear } from "@/src/types/tmdb";
import { requestTvShow } from "@/src/actions/request";
import { toast } from "sonner";
import { Loader2, Tv } from "lucide-react";
import type { TmdbTvShow, TrackedRequest } from "@/src/types/tmdb";

interface RequestSheetProps {
  item: TmdbTvShow | null;
  isOpen: boolean;
  onClose: () => void;
  onRequestSubmitted: (request: TrackedRequest) => void;
}

export function RequestSheet({
  item,
  isOpen,
  onClose,
  onRequestSubmitted,
}: RequestSheetProps) {
  const [submitting, setSubmitting] = useState(false);

  if (!item) return null;

  const year = getTmdbYear(item);
  const posterUrl = tmdbPosterUrl(item.poster_path, "small");

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const result = await requestTvShow(item.id);
      if (result.success) {
        toast.success(`${item.name} requested`);
        onRequestSubmitted({
          tmdbId: item.id,
          mediaType: "tv",
          title: item.name,
          posterPath: item.poster_path,
          requestedAt: new Date().toISOString(),
          status: "requested",
        });
        onClose();
      } else {
        toast.error(result.message);
      }
    } catch {
      toast.error("Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="rounded-t-xl">
        <SheetHeader>
          <SheetTitle>Request TV Show</SheetTitle>
          <SheetDescription>
            This will add all seasons to your library
          </SheetDescription>
        </SheetHeader>

        <div className="flex items-start gap-4 px-4 py-2">
          {posterUrl ? (
            <OptimizedImage
              src={posterUrl}
              alt={item.name}
              className="w-12 h-[72px] rounded-md object-cover shrink-0"
            />
          ) : (
            <div className="w-12 h-[72px] rounded-md bg-muted flex items-center justify-center shrink-0">
              <Tv className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0">
            <p className="font-medium truncate">{item.name}</p>
            {year && <p className="text-sm text-muted-foreground">{year}</p>}
            {item.overview && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {item.overview}
              </p>
            )}
          </div>
        </div>

        <SheetFooter className="flex-row gap-2">
          <SheetClose asChild>
            <Button variant="outline" disabled={submitting}>
              Cancel
            </Button>
          </SheetClose>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Requesting...
              </>
            ) : (
              "Request"
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

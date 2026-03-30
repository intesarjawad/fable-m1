"use client";

import { useEffect, useState } from "react";
import { fetchMovieGenres, fetchTvGenres } from "@/src/actions/tmdb";
import type { TmdbGenre } from "@/src/types/tmdb";
import { ScrollArea, ScrollBar } from "@/src/components/ui/scroll-area";

interface GenreFilterBarProps {
  selectedGenreId: number | null;
  onGenreSelect: (genreId: number | null) => void;
}

function mergeAndDeduplicateGenres(
  movieGenres: TmdbGenre[],
  tvGenres: TmdbGenre[]
): TmdbGenre[] {
  const seenNames = new Map<string, TmdbGenre>();
  for (const genre of [...movieGenres, ...tvGenres]) {
    if (!seenNames.has(genre.name)) {
      seenNames.set(genre.name, genre);
    }
  }
  return Array.from(seenNames.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

export function GenreFilterBar({
  selectedGenreId,
  onGenreSelect,
}: GenreFilterBarProps) {
  const [genres, setGenres] = useState<TmdbGenre[]>([]);

  useEffect(() => {
    async function loadGenres() {
      const [movieGenres, tvGenres] = await Promise.all([
        fetchMovieGenres(),
        fetchTvGenres(),
      ]);
      setGenres(mergeAndDeduplicateGenres(movieGenres, tvGenres));
    }
    loadGenres();
  }, []);

  if (genres.length === 0) return null;

  return (
    <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm py-3">
      <ScrollArea className="w-full">
        <div className="flex gap-2 w-max">
          <button
            type="button"
            onClick={() => onGenreSelect(null)}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
              selectedGenreId === null
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 hover:bg-muted text-foreground"
            }`}
          >
            All
          </button>
          {genres.map((genre) => (
            <button
              key={genre.id}
              type="button"
              onClick={() => onGenreSelect(genre.id)}
              className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
                selectedGenreId === genre.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 hover:bg-muted text-foreground"
              }`}
            >
              {genre.name}
            </button>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { PortraitCard } from "@/src/components/media/portrait-card";
import { PortraitCardSkeleton } from "@/src/components/media/portrait-card";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

const SKELETON_COUNT = 20;

interface NormalizedAnilistItem {
  id: number;
  title: string;
  poster_path: string | null;
  media_type: "tv";
  year: number | null;
  indexer: "anilist";
}

export default function TrendingAnimePage() {
  const [animeList, setAnimeList] = useState<NormalizedAnilistItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadTrendingAnime() {
      try {
        const response = await fetch("/api/anilist/trending?perPage=50");
        if (!response.ok) {
          setError("Could not load trending anime.");
          return;
        }
        const data = await response.json();
        setAnimeList(data.items ?? []);
      } catch {
        setError("Could not load trending anime.");
      } finally {
        setIsLoading(false);
      }
    }

    loadTrendingAnime();
  }, []);

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

          <h1 className="text-foreground text-3xl font-black tracking-tight md:text-4xl">
            Trending Anime
          </h1>

          {!isLoading && !error && (
            <p className="text-sm text-muted-foreground">
              {animeList.length} titles from AniList
            </p>
          )}
        </div>

        {/* Error state */}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-red-400">
            {error}
          </div>
        )}

        {/* Grid */}
        {!error && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7">
            {isLoading
              ? Array.from({ length: SKELETON_COUNT }).map((_, i) => (
                  <PortraitCardSkeleton key={i} />
                ))
              : animeList.map((anime) => (
                  <PortraitCard
                    key={anime.id}
                    title={anime.title}
                    subtitle={anime.year ? String(anime.year) : null}
                    posterUrl={anime.poster_path}
                  />
                ))}
          </div>
        )}
      </div>
    </div>
  );
}

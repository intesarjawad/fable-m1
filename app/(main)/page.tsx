"use client";

import { useEffect, useState, useCallback, type ReactNode } from "react";
import {
  fetchTrendingAll,
  fetchTrendingMovies,
  fetchTrendingTv,
} from "@/src/actions/tmdb";
import { HeroCarousel } from "@/src/components/media/hero-carousel";
import { MediaCarousel, MediaCarouselSlide } from "@/src/components/media/media-carousel";
import { PortraitCard } from "@/src/components/media/portrait-card";
import { PortraitCardSkeleton } from "@/src/components/media/portrait-card";
import { TogglePill } from "@/src/components/media/toggle-pill";
import { MediaLink } from "@/src/components/media/media-link";
import { tmdbPosterUrl } from "@/src/lib/tmdb";
import type { TmdbMediaItem, TmdbMovie, TmdbTvShow } from "@/src/types/tmdb";
import { getTmdbYear } from "@/src/types/tmdb";
import Link from "next/link";

// Section heading with the left accent bar (matching riven's design)
function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="bg-primary h-6 w-1 rounded-full shadow-[0_0_10px_rgba(var(--primary-raw,139,92,246),0.5)]" />
      <h2 className="text-foreground text-2xl font-bold tracking-tight drop-shadow-md">
        {children}
      </h2>
    </div>
  );
}

const VIEW_ALL_BUTTON_CLASS =
  "text-muted-foreground border-white/10 bg-black/20 hover:bg-black/40 hover:text-foreground h-9 px-4 rounded-xl border text-xs font-bold backdrop-blur-md shadow-inner transition-all";

const HERO_BACKDROP_ITEMS_LIMIT = 10;
const CAROUSEL_ITEM_LIMIT = 20;
const CACHE_TTL_MS = 5 * 60 * 1000;

type TrendingTimeWindow = "Today" | "This Week";

// sessionStorage cache helpers
function readFromCache<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts: number; data: T };
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeToCache<T>(key: string, data: T): void {
  try {
    sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    // sessionStorage may be unavailable — not fatal
  }
}

interface RecentlyAddedItem {
  id: number | string;
  title: string;
  poster_path: string | null;
  media_type: string;
  year?: number | string;
  indexer?: string;
}

export default function HomePage() {
  // Hero — TMDB trending all/day (subset with backdrop)
  const [heroItems, setHeroItems] = useState<TmdbMediaItem[]>([]);

  // Recently Added — from Riven library API
  const [recentlyAddedItems, setRecentlyAddedItems] = useState<RecentlyAddedItem[]>([]);
  const [recentlyAddedLoaded, setRecentlyAddedLoaded] = useState(false);

  // Trending Movies
  const [trendingMovies, setTrendingMovies] = useState<TmdbMovie[]>([]);
  const [trendingMoviesTimeWindow, setTrendingMoviesTimeWindow] = useState<TrendingTimeWindow>("Today");

  // Trending TV
  const [trendingTv, setTrendingTv] = useState<TmdbTvShow[]>([]);
  const [trendingTvTimeWindow, setTrendingTvTimeWindow] = useState<TrendingTimeWindow>("Today");

  // Trending Anime
  const [trendingAnime, setTrendingAnime] = useState<RecentlyAddedItem[]>([]);

  const [tmdbLoaded, setTmdbLoaded] = useState(false);

  // Fetch TMDB data on mount (cached)
  useEffect(() => {
    async function loadTmdbData() {
      const cachedHero = readFromCache<TmdbMediaItem[]>("home:hero");
      const cachedMoviesDay = readFromCache<TmdbMovie[]>("home:trending-movies-day");
      const cachedTvDay = readFromCache<TmdbTvShow[]>("home:trending-tv-day");

      const needsHero = !cachedHero;
      const needsMovies = !cachedMoviesDay;
      const needsTv = !cachedTvDay;

      const fetches: Promise<void>[] = [];

      if (needsHero) {
        fetches.push(
          fetchTrendingAll("day").then((items) => {
            const withBackdrops = items
              .filter((item) => item.backdrop_path)
              .slice(0, HERO_BACKDROP_ITEMS_LIMIT);
            setHeroItems(withBackdrops);
            writeToCache("home:hero", withBackdrops);
          })
        );
      } else {
        setHeroItems(cachedHero!);
      }

      if (needsMovies) {
        fetches.push(
          fetchTrendingMovies("day").then((movies) => {
            const sliced = movies.slice(0, CAROUSEL_ITEM_LIMIT);
            setTrendingMovies(sliced);
            writeToCache("home:trending-movies-day", sliced);
          })
        );
      } else {
        setTrendingMovies(cachedMoviesDay!);
      }

      if (needsTv) {
        fetches.push(
          fetchTrendingTv("day").then((shows) => {
            const sliced = shows.slice(0, CAROUSEL_ITEM_LIMIT);
            setTrendingTv(sliced);
            writeToCache("home:trending-tv-day", sliced);
          })
        );
      } else {
        setTrendingTv(cachedTvDay!);
      }

      // Anime (cached separately)
      const cachedAnime = readFromCache<RecentlyAddedItem[]>("home:trending-anime");
      if (!cachedAnime) {
        fetches.push(
          fetch("/api/anilist/trending")
            .then((res) => res.ok ? res.json() : { items: [] })
            .then(({ items }: { items: RecentlyAddedItem[] }) => {
              const sliced = (items ?? []).slice(0, CAROUSEL_ITEM_LIMIT);
              setTrendingAnime(sliced);
              writeToCache("home:trending-anime", sliced);
            })
            .catch(() => {})
        );
      } else {
        setTrendingAnime(cachedAnime);
      }

      await Promise.allSettled(fetches);
      setTmdbLoaded(true);
    }

    loadTmdbData();
  }, []);

  // Recently Added — always fresh on mount
  useEffect(() => {
    fetch("/api/riven/library?sort=date_desc&limit=15&type=movie&type=show")
      .then((res) => res.ok ? res.json() : { items: [] })
      .then(({ items }: { items: RecentlyAddedItem[] }) => {
        setRecentlyAddedItems(items ?? []);
      })
      .catch(() => {})
      .finally(() => setRecentlyAddedLoaded(true));
  }, []);

  // Swap trending movies time window
  const handleMoviesTimeWindowChange = useCallback(
    async (selected: string) => {
      const newWindow = selected as TrendingTimeWindow;
      setTrendingMoviesTimeWindow(newWindow);

      const apiWindow = newWindow === "Today" ? "day" : "week";
      const cacheKey = `home:trending-movies-${apiWindow}`;
      const cached = readFromCache<TmdbMovie[]>(cacheKey);

      if (cached) {
        setTrendingMovies(cached);
        return;
      }

      const movies = await fetchTrendingMovies(apiWindow);
      const sliced = movies.slice(0, CAROUSEL_ITEM_LIMIT);
      setTrendingMovies(sliced);
      writeToCache(cacheKey, sliced);
    },
    []
  );

  // Swap trending TV time window
  const handleTvTimeWindowChange = useCallback(
    async (selected: string) => {
      const newWindow = selected as TrendingTimeWindow;
      setTrendingTvTimeWindow(newWindow);

      const apiWindow = newWindow === "Today" ? "day" : "week";
      const cacheKey = `home:trending-tv-${apiWindow}`;
      const cached = readFromCache<TmdbTvShow[]>(cacheKey);

      if (cached) {
        setTrendingTv(cached);
        return;
      }

      const shows = await fetchTrendingTv(apiWindow);
      const sliced = shows.slice(0, CAROUSEL_ITEM_LIMIT);
      setTrendingTv(sliced);
      writeToCache(cacheKey, sliced);
    },
    []
  );

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      {/* Fixed immersive background */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-900 via-zinc-950 to-black" />
        <div className="absolute top-[-20%] left-[-10%] h-[600px] w-[600px] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute right-[-5%] bottom-[-10%] h-[500px] w-[500px] rounded-full bg-blue-500/5 blur-[100px]" />
      </div>

      <div className="relative z-10 flex flex-col gap-10 pb-24 md:gap-12">
        {/* Hero Carousel — negative top margin pulls it under the sticky search bar gradient */}
        <div className="w-full px-4 -mt-[3.5rem] md:px-8">
          <HeroCarousel items={heroItems} />
        </div>

        {/* Content carousels */}
        <div className="mx-auto flex w-full max-w-[2400px] flex-col gap-12 px-6 md:px-12 lg:px-16">
          {/* Recently Added */}
          {(recentlyAddedItems.length > 0 || !recentlyAddedLoaded) && (
            <section className="flex flex-col gap-4">
              <SectionHeading>Recently Added</SectionHeading>
              <MediaCarousel>
                {!recentlyAddedLoaded
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <MediaCarouselSlide key={i}>
                        <PortraitCardSkeleton className="w-36" />
                      </MediaCarouselSlide>
                    ))
                  : recentlyAddedItems.map((item) => (
                      <MediaCarouselSlide key={`recent-${item.id}`}>
                        <MediaLink
                          id={item.id}
                          mediaType={item.media_type === "tv" ? "tv" : "movie"}
                          indexer={item.indexer === "tvdb" ? "tvdb" : "tmdb"}
                        >
                          <PortraitCard
                            title={item.title}
                            subtitle={item.year ? String(item.year) : null}
                            posterUrl={item.poster_path}
                            className="w-36"
                          />
                        </MediaLink>
                      </MediaCarouselSlide>
                    ))}
              </MediaCarousel>
            </section>
          )}

          {/* Trending Movies */}
          <section className="flex flex-col gap-4">
            <div className="mb-1 flex items-center justify-between">
              <SectionHeading>Trending Movies</SectionHeading>
              <div className="flex items-center gap-3">
                <TogglePill
                  options={["Today", "This Week"]}
                  value={trendingMoviesTimeWindow}
                  onChange={handleMoviesTimeWindowChange}
                />
                <Link href="/lists/trending/movie">
                  <button className={VIEW_ALL_BUTTON_CLASS}>View All</button>
                </Link>
              </div>
            </div>
            <MediaCarousel>
              {!tmdbLoaded
                ? Array.from({ length: 8 }).map((_, i) => (
                    <MediaCarouselSlide key={i}>
                      <PortraitCardSkeleton className="w-36" />
                    </MediaCarouselSlide>
                  ))
                : trendingMovies.map((movie) => (
                    <MediaCarouselSlide key={`movie-${movie.id}`}>
                      <MediaLink id={movie.id} mediaType="movie">
                        <PortraitCard
                          title={movie.title}
                          subtitle={getTmdbYear(movie) ?? null}
                          posterUrl={tmdbPosterUrl(movie.poster_path, "medium")}
                          className="w-36"
                        />
                      </MediaLink>
                    </MediaCarouselSlide>
                  ))}
            </MediaCarousel>
          </section>

          {/* Trending TV Shows */}
          <section className="flex flex-col gap-4">
            <div className="mb-1 flex items-center justify-between">
              <SectionHeading>Trending TV Shows</SectionHeading>
              <div className="flex items-center gap-3">
                <TogglePill
                  options={["Today", "This Week"]}
                  value={trendingTvTimeWindow}
                  onChange={handleTvTimeWindowChange}
                />
                <Link href="/lists/trending/tv">
                  <button className={VIEW_ALL_BUTTON_CLASS}>View All</button>
                </Link>
              </div>
            </div>
            <MediaCarousel>
              {!tmdbLoaded
                ? Array.from({ length: 8 }).map((_, i) => (
                    <MediaCarouselSlide key={i}>
                      <PortraitCardSkeleton className="w-36" />
                    </MediaCarouselSlide>
                  ))
                : trendingTv.map((show) => (
                    <MediaCarouselSlide key={`tv-${show.id}`}>
                      <MediaLink id={show.id} mediaType="tv">
                        <PortraitCard
                          title={show.name}
                          subtitle={getTmdbYear(show) ?? null}
                          posterUrl={tmdbPosterUrl(show.poster_path, "medium")}
                          className="w-36"
                        />
                      </MediaLink>
                    </MediaCarouselSlide>
                  ))}
            </MediaCarousel>
          </section>

          {/* Trending Anime */}
          <section className="flex flex-col gap-4">
            <div className="mb-1 flex items-center justify-between">
              <SectionHeading>Trending Anime</SectionHeading>
              <Link href="/lists/trending/anime">
                <button className={VIEW_ALL_BUTTON_CLASS}>View All</button>
              </Link>
            </div>
            <MediaCarousel>
              {!tmdbLoaded
                ? Array.from({ length: 8 }).map((_, i) => (
                    <MediaCarouselSlide key={i}>
                      <PortraitCardSkeleton className="w-36" />
                    </MediaCarouselSlide>
                  ))
                : trendingAnime.map((anime) => (
                    <MediaCarouselSlide key={`anime-${anime.id}`}>
                      <PortraitCard
                        title={anime.title}
                        subtitle={anime.year ? String(anime.year) : null}
                        posterUrl={anime.poster_path}
                        className="w-36"
                      />
                    </MediaCarouselSlide>
                  ))}
            </MediaCarousel>
          </section>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback, type ReactNode } from "react";
import {
  fetchTrendingMovies,
  fetchTrendingTv,
  fetchNowPlayingMovies,
  fetchOnTheAirTv,
  fetchTopRatedMovies,
  fetchPopularMovies,
  fetchDiscoverMovies,
  fetchDiscoverTv,
  fetchDiscoverByProvider,
} from "@/src/actions/tmdb";
import { fetchResumeItems } from "@/src/actions";
import { HeroCarousel } from "@/src/components/media/hero-carousel";
import { MediaCarousel, MediaCarouselSlide } from "@/src/components/media/media-carousel";
import { PortraitCard, PortraitCardSkeleton } from "@/src/components/media/portrait-card";
import { StatusBadge } from "@/src/components/media/status-badge";
import { TogglePill } from "@/src/components/media/toggle-pill";
import { MediaLink } from "@/src/components/media/media-link";
import { LazyRow } from "@/src/components/home/lazy-row";
import { tmdbPosterUrl } from "@/src/lib/tmdb";
import type { TmdbMediaItem, TmdbMovie, TmdbTvShow } from "@/src/types/tmdb";
import { getTmdbYear } from "@/src/types/tmdb";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

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

const CAROUSEL_ITEM_LIMIT = 20;
const CACHE_TTL_MS = 5 * 60 * 1000;

type TrendingTimeWindow = "Today" | "This Week";

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
  } catch {}
}

// ---------------------------------------------------------------------------
// Item shapes for non-TMDB rows
// ---------------------------------------------------------------------------

interface LibraryItem {
  id: number | string;
  title: string;
  poster_path: string | null;
  media_type: string;
  year?: number | string;
  indexer?: string;
  state?: string | null;
}

interface ResumeItem {
  Id: string;
  Name: string;
  Type: string;
  SeriesName?: string;
  ProductionYear?: number;
  ImageTags?: Record<string, string>;
  SeriesId?: string;
  UserData?: { PlaybackPositionTicks?: number; PlayedPercentage?: number };
}

interface WatchlistItem {
  id: string;
  title: string;
  poster_path: string;
  media_type: "movie" | "tv";
  year: number | null;
  jellyfin_id: string;
}

// ---------------------------------------------------------------------------
// TMDB Provider IDs (US region)
// ---------------------------------------------------------------------------

const PROVIDER_NETFLIX = 8;
const PROVIDER_PRIME = 9;
const PROVIDER_DISNEY = 337;
const PROVIDER_HBO = 1899;
const PROVIDER_HULU = 15;

// TMDB Genre IDs
const GENRE_ACTION = 28;
const GENRE_THRILLER = 53;
const GENRE_COMEDY = 35;
const GENRE_DRAMA = 18;
const GENRE_HORROR = 27;
const GENRE_SCIFI = 878;
const GENRE_WAR = 10752;
const GENRE_CRIME_TV = 80;

// ---------------------------------------------------------------------------
// HomePage
// ---------------------------------------------------------------------------

export default function HomePage() {
  // Hero — from library cross-referenced with trending
  const [heroItems, setHeroItems] = useState<TmdbMediaItem[]>([]);

  // Continue Watching — Jellyfin resume items
  const [resumeItems, setResumeItems] = useState<ResumeItem[]>([]);
  const [resumeLoaded, setResumeLoaded] = useState(false);

  // My Watchlist — Jellyfin favorites
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>([]);
  const [watchlistLoaded, setWatchlistLoaded] = useState(false);

  // Recently Added — Riven library
  const [recentlyAddedItems, setRecentlyAddedItems] = useState<LibraryItem[]>([]);
  const [recentlyAddedLoaded, setRecentlyAddedLoaded] = useState(false);

  // Trending Movies (with time window toggle)
  const [trendingMovies, setTrendingMovies] = useState<TmdbMovie[]>([]);
  const [trendingMoviesTimeWindow, setTrendingMoviesTimeWindow] = useState<TrendingTimeWindow>("Today");

  // Trending TV (with time window toggle)
  const [trendingTv, setTrendingTv] = useState<TmdbTvShow[]>([]);
  const [trendingTvTimeWindow, setTrendingTvTimeWindow] = useState<TrendingTimeWindow>("Today");

  // Trending Anime
  const [trendingAnime, setTrendingAnime] = useState<LibraryItem[]>([]);

  const [tmdbLoaded, setTmdbLoaded] = useState(false);

  // ------------------------------------------------------------------
  // Initial data fetch — hero, trending, anime (cached)
  // ------------------------------------------------------------------
  useEffect(() => {
    async function loadInitialData() {
      const fetches: Promise<void>[] = [];

      // Hero — from our library API
      const cachedHero = readFromCache<TmdbMediaItem[]>("home:hero");
      if (cachedHero) {
        setHeroItems(cachedHero);
      } else {
        fetches.push(
          fetch("/api/home/hero")
            .then((res) => (res.ok ? res.json() : { items: [] }))
            .then(({ items }) => {
              setHeroItems(items ?? []);
              writeToCache("home:hero", items ?? []);
            })
            .catch(() => {}),
        );
      }

      // Trending Movies
      const cachedMovies = readFromCache<TmdbMovie[]>("home:trending-movies-day");
      if (cachedMovies) {
        setTrendingMovies(cachedMovies);
      } else {
        fetches.push(
          fetchTrendingMovies("day").then((movies) => {
            const sliced = movies.slice(0, CAROUSEL_ITEM_LIMIT);
            setTrendingMovies(sliced);
            writeToCache("home:trending-movies-day", sliced);
          }),
        );
      }

      // Trending TV
      const cachedTv = readFromCache<TmdbTvShow[]>("home:trending-tv-day");
      if (cachedTv) {
        setTrendingTv(cachedTv);
      } else {
        fetches.push(
          fetchTrendingTv("day").then((shows) => {
            const sliced = shows.slice(0, CAROUSEL_ITEM_LIMIT);
            setTrendingTv(sliced);
            writeToCache("home:trending-tv-day", sliced);
          }),
        );
      }

      // Trending Anime
      const cachedAnime = readFromCache<LibraryItem[]>("home:trending-anime");
      if (cachedAnime) {
        setTrendingAnime(cachedAnime);
      } else {
        fetches.push(
          fetch("/api/anilist/trending")
            .then((res) => (res.ok ? res.json() : { items: [] }))
            .then(({ items }: { items: LibraryItem[] }) => {
              const sliced = (items ?? []).slice(0, CAROUSEL_ITEM_LIMIT);
              setTrendingAnime(sliced);
              writeToCache("home:trending-anime", sliced);
            })
            .catch(() => {}),
        );
      }

      await Promise.allSettled(fetches);
      setTmdbLoaded(true);
    }

    loadInitialData();
  }, []);

  // ------------------------------------------------------------------
  // Continue Watching, Watchlist, Recently Added (always fresh)
  // ------------------------------------------------------------------
  useEffect(() => {
    // Continue Watching
    fetchResumeItems()
      .then((items) => setResumeItems((items ?? []) as ResumeItem[]))
      .catch(() => {})
      .finally(() => setResumeLoaded(true));

    // Watchlist
    fetch("/api/jellyfin/favorites")
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then(({ items }) => setWatchlistItems(items ?? []))
      .catch(() => {})
      .finally(() => setWatchlistLoaded(true));

    // Recently Added
    fetch("/api/riven/library?sort=date_desc&limit=15&type=movie&type=show")
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then(({ items }: { items: LibraryItem[] }) => setRecentlyAddedItems(items ?? []))
      .catch(() => {})
      .finally(() => setRecentlyAddedLoaded(true));
  }, []);

  // ------------------------------------------------------------------
  // Time window toggles for trending
  // ------------------------------------------------------------------
  const handleMoviesTimeWindowChange = useCallback(async (selected: string) => {
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
  }, []);

  const handleTvTimeWindowChange = useCallback(async (selected: string) => {
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
  }, []);

  // ------------------------------------------------------------------
  // Helper to build a Jellyfin poster URL
  // ------------------------------------------------------------------
  function jellyfinPosterUrl(item: ResumeItem): string | null {
    const imageId = item.SeriesId || item.Id;
    if (!item.ImageTags?.Primary && !item.SeriesId) return null;
    return `/api/jellyfin/image/${imageId}/Images/Primary?maxHeight=400`;
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div className="flex flex-col gap-10 pb-24 md:gap-12">
        {/* Hero Carousel */}
        <div className="w-full px-4 md:px-8">
          <HeroCarousel items={heroItems} />
        </div>

        {/* Content rows */}
        <div className="mx-auto flex w-full max-w-[2400px] flex-col gap-12 px-6 md:px-12 lg:px-16">

          {/* ── Continue Watching ── */}
          {(resumeItems.length > 0 || !resumeLoaded) && (
            <section className="flex flex-col gap-4">
              <SectionHeading>Continue Watching</SectionHeading>
              <MediaCarousel>
                {!resumeLoaded
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <MediaCarouselSlide key={i}>
                        <PortraitCardSkeleton className="w-36" />
                      </MediaCarouselSlide>
                    ))
                  : resumeItems.map((item) => {
                      const isEpisode = item.Type === "Episode";
                      const displayTitle = isEpisode ? (item.SeriesName || item.Name) : item.Name;
                      const subtitle = isEpisode ? item.Name : (item.ProductionYear ? `${item.ProductionYear}` : null);
                      const playedPercent = item.UserData?.PlayedPercentage ?? 0;
                      return (
                        <MediaCarouselSlide key={`resume-${item.Id}`}>
                          <div className="relative">
                            <PortraitCard
                              title={displayTitle}
                              subtitle={subtitle}
                              posterUrl={jellyfinPosterUrl(item)}
                              className="w-36"
                            />
                            {playedPercent > 0 && (
                              <div className="absolute bottom-0 left-0 right-0 h-1 rounded-b bg-white/20">
                                <div
                                  className="bg-primary h-full rounded-b"
                                  style={{ width: `${Math.min(playedPercent, 100)}%` }}
                                />
                              </div>
                            )}
                          </div>
                        </MediaCarouselSlide>
                      );
                    })}
              </MediaCarousel>
            </section>
          )}

          {/* ── My Watchlist ── */}
          {(watchlistItems.length > 0 || !watchlistLoaded) && (
            <section className="flex flex-col gap-4">
              <SectionHeading>My Watchlist</SectionHeading>
              <MediaCarousel>
                {!watchlistLoaded
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <MediaCarouselSlide key={i}>
                        <PortraitCardSkeleton className="w-36" />
                      </MediaCarouselSlide>
                    ))
                  : watchlistItems.map((item) => {
                      const label = item.media_type === "tv" ? "TV" : "Movie";
                      return (
                        <MediaCarouselSlide key={`wl-${item.jellyfin_id}`}>
                          <MediaLink
                            id={item.id}
                            mediaType={item.media_type}
                          >
                            <PortraitCard
                              title={item.title}
                              subtitle={item.year ? `${label} \u2022 ${item.year}` : label}
                              posterUrl={item.poster_path}
                              className="w-36"
                            />
                          </MediaLink>
                        </MediaCarouselSlide>
                      );
                    })}
              </MediaCarousel>
            </section>
          )}

          {/* ── Recently Added ── */}
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
                  : recentlyAddedItems.map((item) => {
                      const mediaLabel = item.media_type === "tv" ? "TV" : "Movie";
                      return (
                        <MediaCarouselSlide key={`recent-${item.id}`}>
                          <MediaLink
                            id={item.id}
                            mediaType={item.media_type === "tv" ? "tv" : "movie"}
                            indexer={item.indexer === "tvdb" ? "tvdb" : "tmdb"}
                          >
                            <PortraitCard
                              title={item.title}
                              subtitle={item.year ? `${mediaLabel} \u2022 ${item.year}` : mediaLabel}
                              posterUrl={item.poster_path}
                              className="w-36"
                              topRight={item.state ? <StatusBadge state={item.state} /> : undefined}
                            />
                          </MediaLink>
                        </MediaCarouselSlide>
                      );
                    })}
              </MediaCarousel>
            </section>
          )}

          {/* ── New Arrivals (Now Playing) ── */}
          <LazyRow
            title="New Arrivals"
            cacheKey="home:now-playing"
            fetchData={fetchNowPlayingMovies}
            viewAllHref="/lists/discover/new-arrivals"
          />

          {/* ── Fresh Series (On The Air) ── */}
          <LazyRow
            title="Fresh Series"
            cacheKey="home:on-the-air"
            fetchData={fetchOnTheAirTv}
            viewAllHref="/lists/discover/fresh-series"
          />

          {/* ── Trending Movies ── */}
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
                          subtitle={getTmdbYear(movie) ? `Movie \u2022 ${getTmdbYear(movie)}` : "Movie"}
                          posterUrl={tmdbPosterUrl(movie.poster_path, "medium")}
                          className="w-36"
                        />
                      </MediaLink>
                    </MediaCarouselSlide>
                  ))}
            </MediaCarousel>
          </section>

          {/* ── Trending TV Shows ── */}
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
                          subtitle={getTmdbYear(show) ? `TV \u2022 ${getTmdbYear(show)}` : "TV"}
                          posterUrl={tmdbPosterUrl(show.poster_path, "medium")}
                          className="w-36"
                        />
                      </MediaLink>
                    </MediaCarouselSlide>
                  ))}
            </MediaCarousel>
          </section>

          {/* ── Trending Anime ── */}
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
                : trendingAnime.map((anime) => {
                    const hasTmdbId = anime.indexer === "tmdb";
                    const card = (
                      <PortraitCard
                        title={anime.title}
                        subtitle={anime.year ? String(anime.year) : null}
                        posterUrl={anime.poster_path}
                        className="w-36"
                      />
                    );
                    return (
                      <MediaCarouselSlide key={`anime-${anime.id}`}>
                        {hasTmdbId ? (
                          <MediaLink id={anime.id} mediaType="tv">
                            {card}
                          </MediaLink>
                        ) : (
                          card
                        )}
                      </MediaCarouselSlide>
                    );
                  })}
            </MediaCarousel>
          </section>

          {/* ── Hall of Fame (Top Rated) ── */}
          <LazyRow
            title="Hall of Fame"
            cacheKey="home:top-rated"
            fetchData={fetchTopRatedMovies}
            viewAllHref="/lists/discover/hall-of-fame"
          />

          {/* ── Editor's Picks (Popular) ── */}
          <LazyRow
            title="Editor's Picks"
            cacheKey="home:popular-movies"
            fetchData={fetchPopularMovies}
            viewAllHref="/lists/discover/editors-picks"
          />

          {/* ── Platform Rows ── */}
          <LazyRow
            title="Netflix"
            cacheKey="home:netflix"
            fetchData={useCallback(() => fetchDiscoverByProvider(PROVIDER_NETFLIX, "movie"), [])}
            viewAllHref="/lists/discover/netflix"
          />
          <LazyRow
            title="Prime Video"
            cacheKey="home:prime"
            fetchData={useCallback(() => fetchDiscoverByProvider(PROVIDER_PRIME, "movie"), [])}
            viewAllHref="/lists/discover/prime"
          />
          <LazyRow
            title="Disney+"
            cacheKey="home:disney"
            fetchData={useCallback(() => fetchDiscoverByProvider(PROVIDER_DISNEY, "movie"), [])}
            viewAllHref="/lists/discover/disney"
          />
          <LazyRow
            title="HBO"
            cacheKey="home:hbo"
            fetchData={useCallback(() => fetchDiscoverByProvider(PROVIDER_HBO, "movie"), [])}
            viewAllHref="/lists/discover/hbo"
          />
          <LazyRow
            title="Hulu"
            cacheKey="home:hulu"
            fetchData={useCallback(() => fetchDiscoverByProvider(PROVIDER_HULU, "movie"), [])}
            viewAllHref="/lists/discover/hulu"
          />

          {/* ── Genre Rows ── */}
          <LazyRow
            title="Adrenaline Rush"
            cacheKey="home:action"
            fetchData={useCallback(async () => {
              const data = await fetchDiscoverMovies(GENRE_ACTION);
              return (data?.results ?? []) as TmdbMovie[];
            }, [])}
            viewAllHref="/lists/discover/action"
          />
          <LazyRow
            title="Edge of Your Seat"
            cacheKey="home:thriller"
            fetchData={useCallback(async () => {
              const data = await fetchDiscoverMovies(GENRE_THRILLER);
              return (data?.results ?? []) as TmdbMovie[];
            }, [])}
            viewAllHref="/lists/discover/thriller"
          />
          <LazyRow
            title="Comedy Club"
            cacheKey="home:comedy"
            fetchData={useCallback(async () => {
              const data = await fetchDiscoverMovies(GENRE_COMEDY);
              return (data?.results ?? []) as TmdbMovie[];
            }, [])}
            viewAllHref="/lists/discover/comedy"
          />
          <LazyRow
            title="The Stage"
            cacheKey="home:drama"
            fetchData={useCallback(async () => {
              const data = await fetchDiscoverMovies(GENRE_DRAMA);
              return (data?.results ?? []) as TmdbMovie[];
            }, [])}
            viewAllHref="/lists/discover/drama"
          />
          <LazyRow
            title="After Dark"
            cacheKey="home:horror"
            fetchData={useCallback(async () => {
              const data = await fetchDiscoverMovies(GENRE_HORROR);
              return (data?.results ?? []) as TmdbMovie[];
            }, [])}
            viewAllHref="/lists/discover/horror"
          />
          <LazyRow
            title="Beyond the Stars"
            cacheKey="home:scifi"
            fetchData={useCallback(async () => {
              const data = await fetchDiscoverMovies(GENRE_SCIFI);
              return (data?.results ?? []) as TmdbMovie[];
            }, [])}
            viewAllHref="/lists/discover/scifi"
          />
          <LazyRow
            title="Battlegrounds"
            cacheKey="home:war"
            fetchData={useCallback(async () => {
              const data = await fetchDiscoverMovies(GENRE_WAR);
              return (data?.results ?? []) as TmdbMovie[];
            }, [])}
            viewAllHref="/lists/discover/war"
          />
          <LazyRow
            title="Criminal Minds"
            cacheKey="home:crime-tv"
            fetchData={useCallback(async () => {
              const data = await fetchDiscoverTv(GENRE_CRIME_TV);
              return (data?.results ?? []) as TmdbTvShow[];
            }, [])}
            viewAllHref="/lists/discover/crime-tv"
          />
        </div>
      </div>
    </div>
  );
}

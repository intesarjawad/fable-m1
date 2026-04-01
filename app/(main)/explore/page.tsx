"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  Suspense,
} from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Search, Sparkles, Info } from "lucide-react";
import { searchTmdb, fetchTrendingMovies, fetchTrendingTv } from "@/src/actions/tmdb";
import { PortraitCard } from "@/src/components/media/portrait-card";
import { PortraitCardSkeleton } from "@/src/components/media/portrait-card";
import { MediaLink } from "@/src/components/media/media-link";
import { TogglePill } from "@/src/components/media/toggle-pill";
import { tmdbPosterUrl, tmdbBackdropUrl } from "@/src/lib/tmdb";
import { Button } from "@/src/components/ui/button";
import type { TmdbMediaItem } from "@/src/types/tmdb";
import {
  getTmdbTitle,
  getTmdbYear,
  getTmdbMediaType,
  isTmdbMovie,
} from "@/src/types/tmdb";
import Link from "next/link";

type MediaTypeFilter = "All" | "Movies" | "TV Shows";

const SKELETON_COUNT = 12;
const HERO_ROTATION_INTERVAL_MS = 8000;
const SUGGESTION_CHIP_ROTATION_INTERVAL_MS = 4000;
const CHIPS_PER_PAGE = 6;
const SEARCH_DEBOUNCE_MS = 350;

function ExplorePageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialQuery = searchParams.get("query") ?? "";

  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [activeQuery, setActiveQuery] = useState(initialQuery);
  const [mediaTypeFilter, setMediaTypeFilter] = useState<MediaTypeFilter>("All");

  // Results state
  const [searchResults, setSearchResults] = useState<TmdbMediaItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Empty state: rotating hero + suggestion chips
  const [trendingPool, setTrendingPool] = useState<TmdbMediaItem[]>([]);
  const [heroIndex, setHeroIndex] = useState(0);
  const [chipPageIndex, setChipPageIndex] = useState(0);
  const [trendingLoaded, setTrendingLoaded] = useState(false);

  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Load trending pool for empty-state hero + suggestion chips
  useEffect(() => {
    async function loadTrendingPool() {
      try {
        const [movies, shows] = await Promise.all([
          fetchTrendingMovies("week"),
          fetchTrendingTv("week"),
        ]);
        const merged = [...movies.slice(0, 10), ...shows.slice(0, 10)].sort(
          (a, b) => b.popularity - a.popularity
        );
        setTrendingPool(merged);
      } catch {
        // Non-fatal — empty state will fall back to generic text
      } finally {
        setTrendingLoaded(true);
      }
    }

    loadTrendingPool();
  }, []);

  // Rotate hero every 8 seconds when in empty state
  useEffect(() => {
    if (activeQuery || trendingPool.length === 0) return;

    const interval = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % trendingPool.length);
    }, HERO_ROTATION_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [activeQuery, trendingPool.length]);

  // Rotate suggestion chips every 4 seconds
  useEffect(() => {
    if (activeQuery || trendingPool.length === 0) return;

    const totalPages = Math.ceil(trendingPool.length / CHIPS_PER_PAGE);
    const interval = setInterval(() => {
      setChipPageIndex((prev) => (prev + 1) % totalPages);
    }, SUGGESTION_CHIP_ROTATION_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [activeQuery, trendingPool.length]);

  // Debounced search
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }

    setIsSearching(true);
    setHasSearched(true);

    try {
      const results = await searchTmdb(query);
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!activeQuery.trim()) {
      setSearchResults([]);
      setHasSearched(false);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    debounceRef.current = setTimeout(() => {
      triggerSearch(activeQuery);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [activeQuery, triggerSearch]);

  // Sync URL query param on search submit
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    setActiveQuery(trimmed);

    const params = new URLSearchParams();
    if (trimmed) params.set("query", trimmed);
    router.replace(`/explore${trimmed ? `?${params.toString()}` : ""}`);
  };

  const handleChipClick = (title: string) => {
    const lower = title.toLowerCase();
    setSearchQuery(lower);
    setActiveQuery(lower);
    const params = new URLSearchParams({ query: lower });
    router.replace(`/explore?${params.toString()}`);
  };

  const handleFeelingLucky = () => {
    if (trendingPool.length === 0) return;
    const randomItem = trendingPool[Math.floor(Math.random() * trendingPool.length)];
    const mediaType = isTmdbMovie(randomItem) ? "movie" : "tv";
    router.push(`/details/${randomItem.id}/${mediaType}`);
  };

  // Filter results by media type tab
  const filteredResults = useMemo(() => {
    if (mediaTypeFilter === "All") return searchResults;
    if (mediaTypeFilter === "Movies")
      return searchResults.filter((item) => isTmdbMovie(item));
    return searchResults.filter((item) => !isTmdbMovie(item));
  }, [searchResults, mediaTypeFilter]);

  const isEmptyState = !activeQuery;
  const heroItem = trendingPool[heroIndex] ?? null;
  const heroBackdropUrl = heroItem
    ? tmdbBackdropUrl(heroItem.backdrop_path, "original")
    : null;

  const suggestionChips = useMemo(() => {
    const start = chipPageIndex * CHIPS_PER_PAGE;
    return trendingPool.slice(start, start + CHIPS_PER_PAGE);
  }, [trendingPool, chipPageIndex]);

  const showResults = !isEmptyState && hasSearched && !isSearching;
  const showLoadingGrid = !isEmptyState && isSearching;
  const showNoResults = showResults && filteredResults.length === 0;

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden">
      {/* Background */}
      {heroBackdropUrl && isEmptyState ? (
        <div className="fixed inset-0 z-0 transition-opacity duration-1000">
          <img
            src={heroBackdropUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-25"
            style={{ filter: "blur(80px)" }}
          />
          <div className="absolute inset-0 bg-zinc-950/80 mix-blend-multiply" />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/50 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/20 via-transparent to-transparent" />
        </div>
      ) : (
        <div className="pointer-events-none fixed inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-b from-zinc-900 via-zinc-950 to-black" />
          <div className="absolute top-[-20%] left-[-10%] h-[600px] w-[600px] rounded-full bg-primary/5 blur-[120px]" />
          <div className="absolute right-[-5%] bottom-[-10%] h-[500px] w-[500px] rounded-full bg-blue-500/5 blur-[100px]" />
        </div>
      )}

      {/* Page content */}
      <div className="relative z-10 mx-auto flex w-full max-w-[2400px] flex-col gap-6 px-6 pt-6 pb-24 md:px-12 md:pt-16 md:pb-12 lg:px-16">
        {/* Header */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h1 className="text-foreground text-3xl font-black tracking-tight drop-shadow-md sm:text-4xl lg:text-5xl">
                {activeQuery ? "Search Results" : "Explore"}
              </h1>
              {activeQuery && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Results for</span>
                  <span className="bg-muted/50 border-border rounded-md border px-2 py-0.5 font-mono text-xs">
                    {activeQuery}
                  </span>
                  {!isSearching && searchResults.length > 0 && (
                    <>
                      <span className="text-border">•</span>
                      <span className="font-medium tabular-nums">
                        {filteredResults.length.toLocaleString()} results
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Media type filter tabs (desktop) */}
            {activeQuery && (
              <div className="hidden md:block">
                <TogglePill
                  options={["All", "Movies", "TV Shows"]}
                  value={mediaTypeFilter}
                  onChange={(v) => setMediaTypeFilter(v as MediaTypeFilter)}
                />
              </div>
            )}
          </div>

          {/* Search bar */}
          <form
            onSubmit={handleSearchSubmit}
            className="flex w-full max-w-2xl items-center gap-3"
          >
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="Search movies, TV shows..."
                className="h-11 w-full rounded-xl border border-border bg-background/70 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <Button type="submit" size="sm" className="h-11 px-6 rounded-xl font-bold">
              Search
            </Button>
          </form>

          {/* Media type filter tabs (mobile) */}
          {activeQuery && (
            <div className="-mx-1 block overflow-x-auto md:hidden">
              <TogglePill
                options={["All", "Movies", "TV Shows"]}
                value={mediaTypeFilter}
                onChange={(v) => setMediaTypeFilter(v as MediaTypeFilter)}
              />
            </div>
          )}
        </div>

        {/* Content */}
        {isEmptyState ? (
          <EmptyState
            heroItem={heroItem}
            suggestionChips={suggestionChips}
            trendingLoaded={trendingLoaded}
            onChipClick={handleChipClick}
            onFeelingLucky={handleFeelingLucky}
          />
        ) : showLoadingGrid ? (
          <SearchResultsGrid isLoading items={[]} />
        ) : showNoResults ? (
          <NoResultsState
            onClear={() => {
              setSearchQuery("");
              setActiveQuery("");
              router.replace("/explore");
            }}
          />
        ) : (
          <SearchResultsGrid items={filteredResults} />
        )}

        {/* Infinite scroll sentinel (placeholder — TMDB multi-search is single-page) */}
        <div ref={sentinelRef} className="h-4" />
      </div>
    </div>
  );
}

// Empty state with rotating hero + suggestion chips
interface EmptyStateProps {
  heroItem: TmdbMediaItem | null;
  suggestionChips: TmdbMediaItem[];
  trendingLoaded: boolean;
  onChipClick: (title: string) => void;
  onFeelingLucky: () => void;
}

function EmptyState({
  heroItem,
  suggestionChips,
  trendingLoaded,
  onChipClick,
  onFeelingLucky,
}: EmptyStateProps) {
  const title = heroItem ? getTmdbTitle(heroItem) : null;
  const mediaType = heroItem
    ? (isTmdbMovie(heroItem) ? "movie" : "tv")
    : null;
  const detailsHref = heroItem && mediaType
    ? `/details/${heroItem.id}/${mediaType}`
    : null;

  return (
    <div className="relative flex flex-col gap-12 py-12 md:py-16">
      {/* Hero section */}
      {trendingLoaded && heroItem ? (
        <div className="flex flex-col gap-6 md:gap-8">
          <div className="max-w-3xl space-y-4">
            {heroItem.vote_average > 0 && (
              <div className="flex items-center gap-3">
                <div className="bg-background/50 flex items-center gap-1.5 rounded-xl border border-white/10 px-2.5 py-1 backdrop-blur-md">
                  <span className="font-black text-[#01b4e4] text-xs">TMDB</span>
                  <span className="text-sm font-bold text-white">
                    {heroItem.vote_average.toFixed(1)}
                  </span>
                </div>
              </div>
            )}
            <h2 className="text-foreground text-4xl font-black tracking-tight drop-shadow-lg md:text-6xl lg:text-7xl">
              {title}
            </h2>
            <p className="text-muted-foreground line-clamp-3 text-lg md:text-xl md:leading-relaxed">
              {heroItem.overview}
            </p>
            <div className="flex flex-wrap items-center gap-4 pt-2">
              {detailsHref && (
                <Link href={detailsHref}>
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-primary/50 text-primary hover:bg-primary/10 hover:text-primary hover:border-primary rounded-xl border bg-transparent font-bold shadow-xl backdrop-blur-md"
                  >
                    <Info className="mr-2 h-5 w-5" />
                    View Details
                  </Button>
                </Link>
              )}
              <Button
                variant="outline"
                size="lg"
                onClick={onFeelingLucky}
                className="border-border text-muted-foreground hover:bg-muted/10 hover:text-foreground hover:border-border/80 group rounded-xl border bg-transparent font-bold backdrop-blur-md"
              >
                <Sparkles className="text-primary group-hover:text-primary mr-2 h-5 w-5 transition-transform duration-500 group-hover:rotate-12" />
                Feeling Lucky
              </Button>
            </div>
          </div>
        </div>
      ) : !trendingLoaded ? (
        <div className="flex flex-col gap-4">
          <div className="h-16 w-96 animate-pulse rounded-xl bg-white/10" />
          <div className="h-6 w-72 animate-pulse rounded-lg bg-white/5" />
          <div className="h-6 w-80 animate-pulse rounded-lg bg-white/5" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <h2 className="text-foreground text-4xl font-bold tracking-tight drop-shadow-sm md:text-5xl lg:text-6xl">
            What would you like to watch?
          </h2>
          <p className="text-muted-foreground text-lg md:text-xl">
            Search movies and TV shows
          </p>
        </div>
      )}

      {/* Suggestion chips */}
      <div className="flex flex-col gap-6 pt-8">
        <h3 className="text-muted-foreground text-sm font-medium tracking-wider uppercase">
          Trending now
        </h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {trendingLoaded
            ? suggestionChips.map((chip) => {
                const chipTitle = getTmdbTitle(chip);
                return (
                  <button
                    key={chip.id}
                    onClick={() => onChipClick(chipTitle)}
                    className="bg-card/50 hover:bg-accent/50 group flex items-center gap-3 rounded-xl border border-transparent p-3 text-left backdrop-blur-sm transition-all duration-300 hover:scale-[1.02] hover:border-border/50 md:gap-4 md:p-5"
                  >
                    <Search className="text-muted-foreground group-hover:text-foreground h-4 w-4 shrink-0 transition-colors duration-300 md:h-5 md:w-5" />
                    <span className="text-foreground text-sm font-medium capitalize leading-tight md:text-lg">
                      {chipTitle}
                    </span>
                  </button>
                );
              })
            : Array.from({ length: CHIPS_PER_PAGE }).map((_, i) => (
                <div
                  key={i}
                  className="h-14 animate-pulse rounded-xl bg-white/5 md:h-16"
                />
              ))}
        </div>
      </div>
    </div>
  );
}

// Grid of search results
interface SearchResultsGridProps {
  items: TmdbMediaItem[];
  isLoading?: boolean;
}

function SearchResultsGrid({ items, isLoading = false }: SearchResultsGridProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7">
      {items.map((item) => {
        const title = getTmdbTitle(item);
        const year = getTmdbYear(item);
        const mediaType = getTmdbMediaType(item);
        const posterUrl = tmdbPosterUrl(item.poster_path, "medium");

        return (
          <MediaLink
            key={`${mediaType}-${item.id}`}
            id={item.id}
            mediaType={mediaType}
          >
            <PortraitCard
              title={title}
              subtitle={year ?? null}
              posterUrl={posterUrl}
            />
          </MediaLink>
        );
      })}

      {isLoading &&
        Array.from({ length: SKELETON_COUNT }).map((_, i) => (
          <PortraitCardSkeleton key={`skel-${i}`} />
        ))}
    </div>
  );
}

function NoResultsState({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16">
      <p className="text-muted-foreground text-lg">No results found</p>
      <p className="text-muted-foreground text-sm">
        Try a different search or browse the suggestions
      </p>
      <Button
        variant="outline"
        size="sm"
        onClick={onClear}
        className="text-muted-foreground hover:text-foreground border-border/50 mt-2 bg-transparent"
      >
        Clear Search
      </Button>
    </div>
  );
}

// Wrap in Suspense to safely use useSearchParams
export default function ExplorePage() {
  return (
    <Suspense>
      <ExplorePageInner />
    </Suspense>
  );
}

"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Search, Film, Tv } from "lucide-react";
import { PortraitCard, PortraitCardSkeleton, MediaLink } from "@/src/components/media";
import { StatusBadge } from "@/src/components/media/status-badge";
import { tmdbPosterUrl } from "@/src/lib/tmdb";
import { cn } from "@/src/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LibraryItem {
  id: number | string;
  title: string;
  poster_path: string | null;
  media_type: string;
  year: number | string;
  indexer: "tmdb" | "tvdb" | string;
  riven_id: number | string;
  state: string | null;
}

interface LibraryApiResponse {
  items: LibraryItem[];
  page: number;
  total_pages: number;
  total_results: number;
}

type SortOption = "date_desc" | "date_asc" | "title_asc" | "title_desc";
type TypeFilter = "movie" | "show";

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 24;
const SEARCH_DEBOUNCE_MS = 300;

const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: "date_desc", label: "Newest first" },
  { value: "date_asc", label: "Oldest first" },
  { value: "title_asc", label: "Title A–Z" },
  { value: "title_desc", label: "Title Z–A" },
];

const TYPE_FILTERS: Array<{ value: TypeFilter; label: string; icon: typeof Film }> = [
  { value: "movie", label: "Movies", icon: Film },
  { value: "show", label: "Shows", icon: Tv },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * The API route pre-builds full poster URLs, but may return relative paths
 * starting with "/" for TMDB posters that were not yet prefixed. Guard both.
 */
function resolvePosterUrl(posterPath: string | null): string | undefined {
  if (!posterPath) return undefined;
  if (posterPath.startsWith("http")) return posterPath;
  return tmdbPosterUrl(posterPath, "medium");
}

// ─── Skeleton grid ────────────────────────────────────────────────────────────

function LibrarySkeletonGrid() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 md:gap-5 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
      {Array.from({ length: PAGE_SIZE }).map((_, skeletonIndex) => (
        <PortraitCardSkeleton key={skeletonIndex} />
      ))}
    </div>
  );
}

// ─── Inner page (requires Suspense boundary for useSearchParams) ──────────────

function LibraryInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read initial state from URL
  const initialSearch = searchParams.get("search") ?? "";
  const initialSort = (searchParams.get("sort") as SortOption) ?? "date_desc";
  const initialPage = Number(searchParams.get("page") ?? "1");
  const initialTypes = searchParams.getAll("type") as TypeFilter[];

  const [searchInput, setSearchInput] = useState(initialSearch);
  const [activeSearch, setActiveSearch] = useState(initialSearch);
  const [sortOption, setSortOption] = useState<SortOption>(initialSort);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [activeTypeFilters, setActiveTypeFilters] = useState<TypeFilter[]>(
    initialTypes.length > 0 ? initialTypes : ["movie", "show"]
  );

  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ── Push current filter state to URL ──────────────────────────────────────

  const syncUrlParams = useCallback(
    (params: {
      search: string;
      sort: SortOption;
      page: number;
      types: TypeFilter[];
    }) => {
      const nextParams = new URLSearchParams();

      if (params.search) nextParams.set("search", params.search);
      nextParams.set("sort", params.sort);
      nextParams.set("page", String(params.page));
      for (const typeValue of params.types) {
        nextParams.append("type", typeValue);
      }

      router.push(`/library?${nextParams.toString()}`, { scroll: false });
    },
    [router]
  );

  // ── Fetch library data ────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function fetchLibraryData() {
      setIsLoading(true);
      setFetchError(null);

      const apiParams = new URLSearchParams();
      apiParams.set("sort", sortOption);
      apiParams.set("limit", String(PAGE_SIZE));
      apiParams.set("page", String(currentPage));
      if (activeSearch) apiParams.set("search", activeSearch);
      for (const typeValue of activeTypeFilters) {
        apiParams.append("type", typeValue);
      }

      try {
        const response = await fetch(`/api/riven/library?${apiParams.toString()}`);
        if (!response.ok) {
          throw new Error(`Library request failed with status ${response.status}`);
        }

        const data: LibraryApiResponse = await response.json();

        if (cancelled) return;
        setLibraryItems(data.items ?? []);
        setTotalResults(data.total_results ?? 0);
        setTotalPages(data.total_pages ?? 1);
      } catch (err) {
        if (cancelled) return;
        setFetchError(err instanceof Error ? err.message : "Failed to load library");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchLibraryData();
    return () => {
      cancelled = true;
    };
  }, [sortOption, currentPage, activeSearch, activeTypeFilters]);

  // ── Search debounce ───────────────────────────────────────────────────────

  function handleSearchChange(value: string) {
    setSearchInput(value);
    clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      setActiveSearch(value);
      setCurrentPage(1);
      syncUrlParams({ search: value, sort: sortOption, page: 1, types: activeTypeFilters });
    }, SEARCH_DEBOUNCE_MS);
  }

  // ── Type filter toggle ────────────────────────────────────────────────────

  function toggleTypeFilter(typeValue: TypeFilter) {
    const nextTypes = activeTypeFilters.includes(typeValue)
      ? activeTypeFilters.filter((t) => t !== typeValue)
      : [...activeTypeFilters, typeValue];

    // Keep at least one type active
    if (nextTypes.length === 0) return;

    setActiveTypeFilters(nextTypes);
    setCurrentPage(1);
    syncUrlParams({ search: activeSearch, sort: sortOption, page: 1, types: nextTypes });
  }

  // ── Sort change ───────────────────────────────────────────────────────────

  function handleSortChange(nextSort: SortOption) {
    setSortOption(nextSort);
    setCurrentPage(1);
    syncUrlParams({ search: activeSearch, sort: nextSort, page: 1, types: activeTypeFilters });
  }

  // ── Pagination ────────────────────────────────────────────────────────────

  function navigatePage(direction: "prev" | "next") {
    const nextPage =
      direction === "prev"
        ? Math.max(1, currentPage - 1)
        : Math.min(totalPages, currentPage + 1);
    if (nextPage === currentPage) return;
    setCurrentPage(nextPage);
    syncUrlParams({ search: activeSearch, sort: sortOption, page: nextPage, types: activeTypeFilters });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="relative px-4 py-6 min-h-screen max-w-full overflow-hidden">
      <div className="mx-auto w-full max-w-[2000px] space-y-6">

        {/* ── Header ── */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-4xl font-bold tracking-tight text-white md:text-5xl">
              Library
            </h1>
            <div className="flex items-center gap-2 text-zinc-400">
              <span className="font-mono text-xs tracking-widest uppercase">Riven</span>
              <span className="h-px w-6 bg-zinc-700" />
              <span className="font-mono text-sm text-primary">
                {totalResults.toLocaleString()} items
              </span>
            </div>
          </div>

          {/* ── Filter bar ── */}
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/5 bg-zinc-900/50 p-2 shadow-xl backdrop-blur-md">
            {/* Search */}
            <div className="group relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500 transition-colors group-focus-within:text-white" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search..."
                className="h-10 w-56 rounded-xl border-transparent bg-transparent pl-9 pr-3 text-sm text-white placeholder:text-zinc-600 outline-none transition-all hover:bg-white/5 focus:bg-white/10"
              />
            </div>

            <div className="hidden h-6 w-px bg-white/10 md:block" />

            {/* Type filter chips */}
            <div className="flex items-center gap-1.5">
              {TYPE_FILTERS.map(({ value, label, icon: Icon }) => {
                const isActive = activeTypeFilters.includes(value);
                return (
                  <button
                    key={value}
                    onClick={() => toggleTypeFilter(value)}
                    className={cn(
                      "flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-medium transition-all",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-zinc-400 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="hidden h-6 w-px bg-white/10 md:block" />

            {/* Sort */}
            <select
              value={sortOption}
              onChange={(e) => handleSortChange(e.target.value as SortOption)}
              className="h-9 rounded-xl border-0 bg-transparent px-3 text-sm text-zinc-400 outline-none hover:bg-white/5 focus:bg-white/10 cursor-pointer"
            >
              {SORT_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value} className="bg-zinc-900 text-white">
                  {label}
                </option>
              ))}
            </select>
          </div>
        </header>

        {/* ── Content ── */}
        {isLoading ? (
          <LibrarySkeletonGrid />
        ) : fetchError ? (
          <div className="flex min-h-64 items-center justify-center rounded-2xl border border-white/10 bg-card">
            <div className="text-center">
              <p className="font-medium text-white">Could not load library</p>
              <p className="mt-1 text-sm text-zinc-500">{fetchError}</p>
            </div>
          </div>
        ) : libraryItems.length === 0 ? (
          <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-white/5 bg-zinc-900/50">
              <Search className="h-8 w-8 text-zinc-600" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-white">No items found</h3>
              <p className="mt-1 max-w-xs text-sm text-zinc-500">
                Try adjusting the filters or search term.
              </p>
            </div>
            {(activeSearch || activeTypeFilters.length < 2) && (
              <button
                onClick={() => {
                  setSearchInput("");
                  setActiveSearch("");
                  setActiveTypeFilters(["movie", "show"]);
                  setCurrentPage(1);
                  router.push("/library");
                }}
                className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 md:gap-5 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
              {libraryItems.map((item, itemIndex) => (
                <div
                  key={item.riven_id}
                  className="animate-in fade-in slide-in-from-bottom-4 fill-mode-backwards duration-700"
                  style={{ animationDelay: `${itemIndex * 30}ms` }}
                >
                  <MediaLink
                    id={item.id}
                    mediaType={item.media_type === "tv" ? "tv" : "movie"}
                    indexer={item.indexer === "tvdb" ? "tvdb" : "tmdb"}
                  >
                    <PortraitCard
                      title={item.title}
                      subtitle={String(item.year)}
                      posterUrl={resolvePosterUrl(item.poster_path)}
                      topRight={item.state ? <StatusBadge state={item.state} /> : undefined}
                    />
                  </MediaLink>
                </div>
              ))}
            </div>

            {/* ── Pagination ── */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 pt-8 pb-16">
                <button
                  onClick={() => navigatePage("prev")}
                  disabled={currentPage <= 1}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-30"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                <span className="font-mono text-sm text-zinc-400">
                  Page <span className="text-white">{currentPage}</span> of{" "}
                  <span className="text-white">{totalPages}</span>
                </span>

                <button
                  onClick={() => navigatePage("next")}
                  disabled={currentPage >= totalPages}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-30"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Page export ──────────────────────────────────────────────────────────────

export default function LibraryPage() {
  return (
    <Suspense
      fallback={
        <div className="relative px-4 py-6 min-h-screen">
          <div className="mx-auto w-full max-w-[2000px] space-y-6">
            <div className="h-16 w-64 animate-pulse rounded-xl bg-zinc-900/60" />
            <LibrarySkeletonGrid />
          </div>
        </div>
      }
    >
      <LibraryInner />
    </Suspense>
  );
}

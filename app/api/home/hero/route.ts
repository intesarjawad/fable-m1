import { resolveRivenConfig } from "@/src/actions/riven";
import { getTmdbConfig } from "@/src/actions/store/server-actions";
import { NextResponse } from "next/server";

const TMDB_BASE = "https://api.themoviedb.org/3";
const HERO_ITEM_LIMIT = 10;
const MINIMUM_CROSS_REFERENCED_ITEMS = 5;
const RIVEN_LIBRARY_FETCH_LIMIT = 100;

interface TmdbTrendingItem {
  id: number;
  title?: string;
  name?: string;
  overview?: string;
  backdrop_path?: string | null;
  media_type?: "movie" | "tv" | "person" | "company";
  vote_average?: number | null;
  genre_ids?: number[];
  release_date?: string;
  first_air_date?: string;
  original_language?: string;
}

interface RivenLibraryItem {
  id: string | number;
  tmdb_id?: string;
  title: string;
  type: string;
}

async function resolveTmdbApiKey(): Promise<string | null> {
  const cookieConfig = await getTmdbConfig();
  if (cookieConfig?.apiKey) return cookieConfig.apiKey;
  return process.env.TMDB_API_KEY || null;
}

async function fetchTrendingAll(tmdbApiKey: string): Promise<TmdbTrendingItem[]> {
  const trendingUrl = `${TMDB_BASE}/trending/all/day?api_key=${tmdbApiKey}`;

  const response = await fetch(trendingUrl, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`TMDB trending fetch failed: ${response.status}`);
  }

  const data = await response.json();
  return (data.results ?? []) as TmdbTrendingItem[];
}

async function fetchRivenLibraryTmdbIds(rivenApiUrl: string, rivenApiKey: string): Promise<Set<number>> {
  const targetUrl = new URL(`${rivenApiUrl}/api/v1/items`);
  targetUrl.searchParams.set("limit", String(RIVEN_LIBRARY_FETCH_LIMIT));
  targetUrl.searchParams.set("sort", "date_desc");
  targetUrl.searchParams.append("states", "Completed");
  targetUrl.searchParams.append("states", "PartiallyCompleted");
  targetUrl.searchParams.append("type", "movie");
  targetUrl.searchParams.append("type", "show");

  const response = await fetch(targetUrl.toString(), {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-api-key": rivenApiKey,
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Riven library fetch failed: ${response.status}`);
  }

  const data = await response.json();
  const libraryItems: RivenLibraryItem[] = data.items ?? [];

  const tmdbIds = new Set<number>();
  for (const item of libraryItems) {
    if (item.tmdb_id) {
      const parsedId = parseInt(item.tmdb_id, 10);
      if (!Number.isNaN(parsedId)) {
        tmdbIds.add(parsedId);
      }
    }
  }

  return tmdbIds;
}

export async function GET(): Promise<NextResponse> {
  const [tmdbApiKey, rivenConfig] = await Promise.all([
    resolveTmdbApiKey(),
    resolveRivenConfig(),
  ]);

  if (!tmdbApiKey) {
    return NextResponse.json(
      { success: false, message: "TMDB not configured" },
      { status: 503 },
    );
  }

  try {
    const trendingItems = await fetchTrendingAll(tmdbApiKey);

    // Filter to items with backdrop images — required for hero display
    const trendingWithBackdrops = trendingItems.filter(
      (item) => item.backdrop_path && item.media_type !== "person",
    );

    if (!rivenConfig) {
      // Riven not configured — fall back to trending directly
      return NextResponse.json({
        items: trendingWithBackdrops.slice(0, HERO_ITEM_LIMIT),
      });
    }

    const baseUrl = rivenConfig.apiUrl.replace(/\/+$/, "");

    let rivenTmdbIds: Set<number>;
    try {
      rivenTmdbIds = await fetchRivenLibraryTmdbIds(baseUrl, rivenConfig.apiKey);
    } catch (rivenError) {
      const message = rivenError instanceof Error ? rivenError.message : "Riven unreachable";
      console.warn(`[home/hero] Riven fetch failed, falling back to trending only: ${message}`);
      return NextResponse.json({
        items: trendingWithBackdrops.slice(0, HERO_ITEM_LIMIT),
      });
    }

    const crossReferencedItems = trendingWithBackdrops.filter((item) =>
      rivenTmdbIds.has(item.id),
    );

    const heroItems =
      crossReferencedItems.length >= MINIMUM_CROSS_REFERENCED_ITEMS
        ? crossReferencedItems.slice(0, HERO_ITEM_LIMIT)
        : trendingWithBackdrops.slice(0, HERO_ITEM_LIMIT);

    return NextResponse.json({ items: heroItems });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Hero fetch failed";
    console.error(`[home/hero] ${message}`);
    return NextResponse.json(
      { success: false, message },
      { status: 502 },
    );
  }
}

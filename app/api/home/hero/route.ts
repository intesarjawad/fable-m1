import { fetchAllLibraryTmdbIds } from "@/src/actions/media";
import { getTmdbConfig } from "@/src/actions/store/server-actions";
import { NextResponse } from "next/server";

const TMDB_BASE = "https://api.themoviedb.org/3";
const HERO_ITEM_LIMIT = 10;
const MINIMUM_CROSS_REFERENCED_ITEMS = 5;

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

export async function GET(): Promise<NextResponse> {
  const tmdbApiKey = await resolveTmdbApiKey();

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

    let libraryTmdbIds: Set<number>;
    try {
      const entries = await fetchAllLibraryTmdbIds();
      libraryTmdbIds = new Set(
        entries
          .map((entry) => entry.tmdbId)
          .filter((id): id is number => typeof id === "number" && id > 0),
      );
    } catch (libraryError) {
      const message = libraryError instanceof Error ? libraryError.message : "Library unreachable";
      console.warn(`[home/hero] Jellyfin library fetch failed, falling back to trending only: ${message}`);
      return NextResponse.json({
        items: trendingWithBackdrops.slice(0, HERO_ITEM_LIMIT),
      });
    }

    const crossReferencedItems = trendingWithBackdrops.filter((item) =>
      libraryTmdbIds.has(item.id),
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

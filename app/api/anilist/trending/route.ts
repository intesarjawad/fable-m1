import { NextRequest, NextResponse } from "next/server";

const ANILIST_GRAPHQL_URL = "https://graphql.anilist.co";
const TMDB_BASE = "https://api.themoviedb.org/3";

const DEFAULT_PAGE_SIZE = 20;

function buildTrendingQuery(page: number, perPage: number): string {
  return `
query {
  Page(page: ${page}, perPage: ${perPage}) {
    pageInfo {
      hasNextPage
      total
    }
    media(type: ANIME, sort: TRENDING_DESC) {
      id
      title {
        romaji
        english
        native
      }
      coverImage {
        large
        medium
      }
      seasonYear
      format
    }
  }
}
`.trim();
}

interface AnilistMediaItem {
  id: number;
  title: {
    romaji: string;
    english: string | null;
    native: string;
  };
  coverImage: {
    large: string;
    medium: string;
  };
  seasonYear: number;
  format: string;
}

interface NormalizedAnilistItem {
  id: number | string;
  title: string;
  poster_path: string;
  media_type: "tv";
  year: number;
  indexer: "tmdb" | "anilist";
  tmdb_id: number | null;
}

/** Search TMDB for an anime title and return the best TV match */
async function findTmdbId(
  title: string,
  year: number | null,
  apiKey: string,
): Promise<number | null> {
  try {
    const params = new URLSearchParams({
      api_key: apiKey,
      query: title,
      language: "en-US",
    });
    if (year) params.set("first_air_date_year", String(year));

    const response = await fetch(`${TMDB_BASE}/search/tv?${params}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;

    const data = await response.json();
    const results = data.results ?? [];
    if (results.length === 0) return null;

    // Best match: exact title match with the same year, or just the first result
    const exactMatch = results.find(
      (r: any) =>
        r.name?.toLowerCase() === title.toLowerCase() ||
        r.original_name?.toLowerCase() === title.toLowerCase(),
    );
    return (exactMatch?.id ?? results[0].id) as number;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const pageParam = new URL(request.url).searchParams.get("page");
  const page = pageParam ? parseInt(pageParam, 10) : 1;

  if (isNaN(page) || page < 1) {
    return NextResponse.json(
      { success: false, message: 'Query param "page" must be a positive integer' },
      { status: 400 },
    );
  }

  const tmdbApiKey = process.env.TMDB_API_KEY;

  try {
    const response = await fetch(ANILIST_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        query: buildTrendingQuery(page, DEFAULT_PAGE_SIZE),
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { success: false, message: `AniList returned ${response.status}` },
        { status: 502 },
      );
    }

    const anilistData = await response.json();

    if (anilistData.errors) {
      console.error("[anilist/trending] GraphQL errors:", anilistData.errors);
      return NextResponse.json(
        {
          success: false,
          message: "AniList GraphQL error",
          errors: anilistData.errors,
        },
        { status: 502 },
      );
    }

    const rawItems: AnilistMediaItem[] =
      anilistData.data?.Page?.media ?? [];
    const hasNextPage: boolean =
      anilistData.data?.Page?.pageInfo?.hasNextPage ?? false;

    // Resolve TMDB IDs in parallel for all items
    let tmdbIds: (number | null)[] = [];
    if (tmdbApiKey) {
      tmdbIds = await Promise.all(
        rawItems.map((item) => {
          const searchTitle = item.title.english ?? item.title.romaji;
          return findTmdbId(searchTitle, item.seasonYear, tmdbApiKey);
        }),
      );
    }

    const normalizedItems: NormalizedAnilistItem[] = rawItems.map((item, i) => {
      const tmdbId = tmdbIds[i] ?? null;
      return {
        id: tmdbId ?? item.id,
        title: item.title.english ?? item.title.romaji ?? item.title.native,
        poster_path: item.coverImage.large,
        media_type: "tv",
        year: item.seasonYear,
        indexer: tmdbId ? "tmdb" : "anilist",
        tmdb_id: tmdbId,
      };
    });

    return NextResponse.json({ items: normalizedItems, page, hasNextPage });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Network error";
    console.error("[anilist/trending] Fetch failed:", error);
    return NextResponse.json(
      { success: false, message: `AniList unreachable: ${message}` },
      { status: 502 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";

const ANILIST_GRAPHQL_URL = "https://graphql.anilist.co";
const ANI_ZIP_BASE = "https://api.ani.zip/v1/mappings";

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
  media_type: "tv" | "movie";
  year: number;
  indexer: "tmdb" | "anilist";
  tmdb_id: number | null;
}

/** Resolve AniList ID to TMDB ID via ani.zip mapping service (same as riven-frontend) */
async function resolveAnilistToTmdb(anilistId: number): Promise<number | null> {
  try {
    const response = await fetch(`${ANI_ZIP_BASE}?anilist_id=${anilistId}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;

    const data = await response.json();
    // ani.zip returns themoviedb_id at root or under mappings
    const tmdbId = data.themoviedb_id ?? data.mappings?.themoviedb_id;
    return tmdbId ? Number(tmdbId) : null;
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

    // Resolve TMDB IDs in parallel via ani.zip (same approach as riven-frontend)
    const tmdbIds = await Promise.all(
      rawItems.map((item) => resolveAnilistToTmdb(item.id)),
    );

    const normalizedItems: NormalizedAnilistItem[] = rawItems.map((item, i) => {
      const tmdbId = tmdbIds[i];
      const isMovie = item.format === "MOVIE";
      return {
        id: tmdbId ?? item.id,
        title: item.title.english ?? item.title.romaji ?? item.title.native,
        poster_path: item.coverImage.large,
        media_type: isMovie ? "movie" : "tv",
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

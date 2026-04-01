import { NextRequest, NextResponse } from "next/server";

const ANILIST_GRAPHQL_URL = "https://graphql.anilist.co";

const DEFAULT_PAGE_SIZE = 20;

function buildTrendingQuery(page: number, perPage: number): string {
  return `
query {
  Page(page: ${page}, perPage: ${perPage}) {
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
  id: number;
  title: string;
  poster_path: string;
  media_type: "tv";
  year: number;
  indexer: "anilist";
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

    const normalizedItems: NormalizedAnilistItem[] = rawItems.map((item) => ({
      id: item.id,
      title:
        item.title.english ?? item.title.romaji ?? item.title.native,
      poster_path: item.coverImage.large,
      media_type: "tv",
      year: item.seasonYear,
      indexer: "anilist",
    }));

    return NextResponse.json({ items: normalizedItems, page });
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

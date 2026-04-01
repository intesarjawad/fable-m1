import { NextRequest, NextResponse } from "next/server";
import { getTmdbConfig } from "@/src/actions/store/server-actions";

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

async function resolveTmdbApiKey(): Promise<string | null> {
  const cookieConfig = await getTmdbConfig();
  if (cookieConfig?.apiKey) return cookieConfig.apiKey;
  return process.env.TMDB_API_KEY ?? null;
}

interface TmdbImageEntry {
  file_path: string;
  iso_639_1: string | null;
}

interface TmdbReleaseDateEntry {
  certification: string;
}

interface TmdbReleaseResult {
  iso_3166_1: string;
  release_dates: TmdbReleaseDateEntry[];
}

interface TmdbContentRatingResult {
  iso_3166_1: string;
  rating: string;
}

export async function GET(
  _request: NextRequest,
  props: { params: Promise<{ type: string; id: string }> },
): Promise<NextResponse> {
  const { type, id } = await props.params;

  if (!type || !id || (type !== "movie" && type !== "tv")) {
    return NextResponse.json(
      { success: false, message: 'Path param "type" must be "movie" or "tv"' },
      { status: 400 },
    );
  }

  const tmdbApiKey = await resolveTmdbApiKey();
  if (!tmdbApiKey) {
    return NextResponse.json(
      { success: false, message: "TMDB is not configured" },
      { status: 503 },
    );
  }

  try {
    const tmdbPath = type === "movie" ? `/movie/${id}` : `/tv/${id}`;
    const appendToResponse =
      type === "movie" ? "images,release_dates" : "images,content_ratings";

    const tmdbParams = new URLSearchParams({
      api_key: tmdbApiKey,
      language: "en-US",
      append_to_response: appendToResponse,
      // Include all language logos, not just the session language
      include_image_language: "en,null",
    });

    const response = await fetch(
      `${TMDB_BASE}${tmdbPath}?${tmdbParams}`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!response.ok) {
      return NextResponse.json({ logoUrl: null, certification: null });
    }

    const tmdbData = await response.json();

    // Resolve logo — prefer English, fall back to first available
    const logos: TmdbImageEntry[] = tmdbData.images?.logos ?? [];
    const englishLogo = logos.find((logo) => logo.iso_639_1 === "en");
    const chosenLogo = englishLogo ?? logos[0];
    const logoUrl = chosenLogo
      ? `${TMDB_IMAGE_BASE}/w500${chosenLogo.file_path}`
      : null;

    // Resolve certification
    let certification: string | null = null;

    if (type === "movie") {
      const releaseDates: TmdbReleaseResult[] =
        tmdbData.release_dates?.results ?? [];
      const usRelease = releaseDates.find((r) => r.iso_3166_1 === "US");
      if (usRelease) {
        const certEntry = usRelease.release_dates.find(
          (d) => d.certification,
        );
        certification = certEntry?.certification ?? null;
      }
    } else {
      const contentRatings: TmdbContentRatingResult[] =
        tmdbData.content_ratings?.results ?? [];
      const usRating = contentRatings.find((r) => r.iso_3166_1 === "US");
      certification = usRating?.rating ?? null;
    }

    return NextResponse.json({ logoUrl, certification });
  } catch (error) {
    console.error("[tmdb/logo] Fetch failed:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch TMDB logo data" },
      { status: 502 },
    );
  }
}

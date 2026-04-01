import { NextRequest, NextResponse } from "next/server";
import { getTmdbConfig } from "@/src/actions/store/server-actions";

const TMDB_BASE = "https://api.themoviedb.org/3";
const RADARR_IMDB_BASE = "https://api.radarr.video/v1/movie/imdb";
const RT_ALGOLIA_URL = "https://79frdp12pn-dsn.algolia.net/1/indexes/*/queries";
const RT_ALGOLIA_API_KEY = "175588f6e5f8319b27702e4cc4013561";
const RT_ALGOLIA_APP_ID = "79FRDP12PN";

// RT matching tunables — sourced from Jellyseerr / riven-frontend
const INEXACT_TITLE_FACTOR = 0.25;
const ALTERNATE_TITLE_FACTOR = 0.8;
const PER_YEAR_PENALTY = 0.4;
const MINIMUM_SCORE = 0.175;

interface RatingScore {
  name: string;
  image: string;
  score: number | string;
  url: string;
}

interface RadarrImdbMovie {
  ImdbId: string;
  MovieRatings: {
    Imdb?: { Value: number };
  };
}

interface RTAlgoliaHit {
  title: string;
  titles?: string[];
  releaseYear: number;
  vanity: string;
  aka?: string[];
  rottenTomatoes?: {
    audienceScore: number;
    certifiedFresh: boolean;
    criticsScore: number;
  };
}

interface RTAlgoliaResponse {
  results: {
    hits: RTAlgoliaHit[];
    index: "content_rt" | "people_rt";
  }[];
}

async function resolveTmdbApiKey(): Promise<string | null> {
  const cookieConfig = await getTmdbConfig();
  if (cookieConfig?.apiKey) return cookieConfig.apiKey;
  return process.env.TMDB_API_KEY ?? null;
}

// Jaro similarity for fuzzy title matching
function jaroSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const matchWindow = Math.floor(Math.max(a.length, b.length) / 2) - 1;
  const aMatches = new Array(a.length).fill(false);
  const bMatches = new Array(b.length).fill(false);

  let matchCount = 0;
  let transpositions = 0;

  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, b.length);
    for (let j = start; j < end; j++) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matchCount++;
      break;
    }
  }

  if (matchCount === 0) return 0;

  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }

  return (
    (matchCount / a.length +
      matchCount / b.length +
      (matchCount - transpositions / 2) / matchCount) /
    3
  );
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .trim();
}

function titleSimilarity(a: string, b: string): number {
  return a === b ? 1 : jaroSimilarity(a, b) * INEXACT_TITLE_FACTOR;
}

function getTitleScore(hit: RTAlgoliaHit, searchTitle: string): number {
  const normalizedSearch = normalizeTitle(searchTitle);

  const scoreVariant = (title: string, isAlternate: boolean): number => {
    const score = titleSimilarity(normalizeTitle(title), normalizedSearch);
    return isAlternate ? score * ALTERNATE_TITLE_FACTOR : score;
  };

  const allTitles = [hit.title, ...(hit.aka ?? []), ...(hit.titles ?? [])];
  const scores = allTitles.map((title, index) => scoreVariant(title, index > 0));
  return Math.max(...scores);
}

function getYearScore(hit: RTAlgoliaHit, year?: number): number {
  if (!year) return 1;
  return Math.max(0, 1 - Math.abs(hit.releaseYear - year) * PER_YEAR_PENALTY);
}

function getExtraScore(hit: RTAlgoliaHit): number {
  return hit.rottenTomatoes ? 1 : 0.5;
}

function calculateHitScore(hit: RTAlgoliaHit, title: string, year?: number): number {
  return getTitleScore(hit, title) * getYearScore(hit, year) * getExtraScore(hit);
}

function findBestRTMatch(
  hits: RTAlgoliaHit[],
  title: string,
  year?: number,
): RTAlgoliaHit | null {
  const scored = hits
    .map((hit) => ({ hit, score: calculateHitScore(hit, title, year) }))
    .filter(({ score }) => score > MINIMUM_SCORE)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.hit ?? null;
}

function getYearFromISODate(isoDate?: string): number | undefined {
  if (!isoDate) return undefined;
  const parsed = new Date(isoDate).getFullYear();
  return isNaN(parsed) ? undefined : parsed;
}

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ tmdbId: string }> },
): Promise<NextResponse> {
  const { tmdbId } = await props.params;
  const mediaType = new URL(request.url).searchParams.get("type") as
    | "movie"
    | "tv"
    | null;

  if (!mediaType || !["movie", "tv"].includes(mediaType)) {
    return NextResponse.json(
      { success: false, message: 'Query param "type" must be "movie" or "tv"' },
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

  let tmdbScore: RatingScore | null = null;
  let imdbScore: RatingScore | null = null;
  let rtCriticsScore: RatingScore | null = null;
  let rtAudienceScore: RatingScore | null = null;

  let imdbId: string | null = null;
  let title: string | null = null;
  let releaseYear: number | undefined;

  // Fetch TMDB details with external_ids appended
  try {
    const tmdbPath =
      mediaType === "movie" ? `/movie/${tmdbId}` : `/tv/${tmdbId}`;
    const tmdbParams = new URLSearchParams({
      api_key: tmdbApiKey,
      language: "en-US",
      append_to_response: "external_ids",
    });

    const tmdbResponse = await fetch(
      `${TMDB_BASE}${tmdbPath}?${tmdbParams}`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      },
    );

    if (tmdbResponse.ok) {
      const tmdbData = await tmdbResponse.json();

      if (mediaType === "movie") {
        title = tmdbData.title ?? null;
        releaseYear = getYearFromISODate(tmdbData.release_date);
        imdbId = tmdbData.imdb_id ?? tmdbData.external_ids?.imdb_id ?? null;
      } else {
        title = tmdbData.name ?? null;
        releaseYear = getYearFromISODate(tmdbData.first_air_date);
        imdbId = tmdbData.external_ids?.imdb_id ?? null;
      }

      const voteAverage = tmdbData.vote_average as number | undefined;
      if (voteAverage && voteAverage > 0) {
        tmdbScore = {
          name: "tmdb",
          image: "tmdb.svg",
          score: `${Math.round(voteAverage * 10)}%`,
          url: `https://www.themoviedb.org/${mediaType}/${tmdbId}`,
        };
      }
    }
  } catch (fetchError) {
    console.error("[ratings] TMDB fetch failed:", fetchError);
  }

  // Fan-out to IMDb (movies only) and Rotten Tomatoes in parallel
  const pendingFetches: Promise<void>[] = [];

  if (imdbId && mediaType === "movie") {
    pendingFetches.push(
      (async () => {
        try {
          const radarrResponse = await fetch(
            `${RADARR_IMDB_BASE}/${imdbId}`,
            {
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              signal: AbortSignal.timeout(5000),
            },
          );

          if (radarrResponse.ok) {
            const radarrData: RadarrImdbMovie[] = await radarrResponse.json();
            const matchedMovie = radarrData.find((m) => m.ImdbId === imdbId);

            if (matchedMovie?.MovieRatings?.Imdb?.Value) {
              imdbScore = {
                name: "imdb",
                image: "imdb.svg",
                score: matchedMovie.MovieRatings.Imdb.Value,
                url: `https://www.imdb.com/title/${imdbId}/`,
              };
            }
          }
        } catch (fetchError) {
          if (
            fetchError instanceof Error &&
            fetchError.name === "TimeoutError"
          ) {
            console.error("[ratings] Radarr IMDb proxy timed out");
          } else {
            console.error("[ratings] Radarr IMDb proxy failed:", fetchError);
          }
        }
      })(),
    );
  }

  if (title) {
    pendingFetches.push(
      (async () => {
        try {
          const contentType = mediaType === "movie" ? "movie" : "tv";
          const algoliaFilters = encodeURIComponent(
            `isEmsSearchable=1 AND type:"${contentType}"`,
          );
          // Strip leading "the" to improve RT match rate (Jellyseerr approach)
          const searchQuery =
            mediaType === "movie"
              ? title!.replace(/\bthe\b ?/gi, "")
              : title!;

          const rtResponse = await fetch(RT_ALGOLIA_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              "x-algolia-agent":
                "Algolia for JavaScript (4.14.3); Browser (lite)",
              "x-algolia-api-key": RT_ALGOLIA_API_KEY,
              "x-algolia-application-id": RT_ALGOLIA_APP_ID,
            },
            body: JSON.stringify({
              requests: [
                {
                  indexName: "content_rt",
                  query: searchQuery,
                  params: `filters=${algoliaFilters}&hitsPerPage=20`,
                },
              ],
            }),
            signal: AbortSignal.timeout(5000),
          });

          if (rtResponse.ok) {
            const rtData: RTAlgoliaResponse = await rtResponse.json();
            const contentIndex = rtData.results.find(
              (r) => r.index === "content_rt",
            );
            const bestMatch = findBestRTMatch(
              contentIndex?.hits ?? [],
              title!,
              releaseYear,
            );

            if (bestMatch?.rottenTomatoes) {
              const rt = bestMatch.rottenTomatoes;
              const rtUrl = `https://www.rottentomatoes.com/${
                mediaType === "movie" ? "m" : "tv"
              }/${bestMatch.vanity}`;

              if (rt.criticsScore > 0) {
                let criticsName: string;
                let criticsImage: string;

                if (mediaType === "movie" && rt.certifiedFresh) {
                  criticsName = "rt_tomatometer_certified_fresh";
                  criticsImage = "rt_certified_fresh.svg";
                } else if (rt.criticsScore >= 60) {
                  criticsName = "rt_tomatometer_fresh";
                  criticsImage = "rt_fresh.svg";
                } else {
                  criticsName = "rt_tomatometer_rotten";
                  criticsImage = "rt_rotten.svg";
                }

                rtCriticsScore = {
                  name: criticsName,
                  image: criticsImage,
                  score: `${rt.criticsScore}%`,
                  url: rtUrl,
                };
              }

              if (rt.audienceScore > 0) {
                const audienceIsFresh = rt.audienceScore >= 60;
                rtAudienceScore = {
                  name: audienceIsFresh
                    ? "rt_popcornmeter_fresh"
                    : "rt_popcornmeter_stale",
                  image: audienceIsFresh ? "rt_aud_fresh.svg" : "rt_aud_rotten.svg",
                  score: `${rt.audienceScore}%`,
                  url: rtUrl,
                };
              }
            }
          }
        } catch (fetchError) {
          if (
            fetchError instanceof Error &&
            fetchError.name === "TimeoutError"
          ) {
            console.error("[ratings] Rotten Tomatoes fetch timed out");
          } else {
            console.error("[ratings] Rotten Tomatoes fetch failed:", fetchError);
          }
        }
      })(),
    );
  }

  await Promise.all(pendingFetches);

  // Assemble scores in canonical order: TMDB, IMDb, RT Critics, RT Audience
  const scores: RatingScore[] = [];
  if (tmdbScore) scores.push(tmdbScore);
  if (imdbScore) scores.push(imdbScore);
  if (rtCriticsScore) scores.push(rtCriticsScore);
  if (rtAudienceScore) scores.push(rtAudienceScore);

  return NextResponse.json(
    { scores, tmdbId: Number(tmdbId), mediaType, imdbId },
    {
      headers: {
        "Cache-Control": "public, max-age=3600",
      },
    },
  );
}

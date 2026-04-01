"use server";

import { getTmdbConfig } from "./store/server-actions";

import type {
  TmdbMovieDetails,
  TmdbTvDetails,
  TmdbSeasonDetails,
} from "@/src/types/details";

export type {
  TmdbGenreDetail,
  TmdbCastMember,
  TmdbCrewMember,
  TmdbCredits,
  TmdbVideo,
  TmdbVideoResults,
  TmdbLogoImage,
  TmdbImageResults,
  TmdbReleaseDate,
  TmdbReleaseDateEntry,
  TmdbReleaseDates,
  TmdbProductionCompany,
  TmdbRecommendationMovie,
  TmdbSimilarMovie,
  TmdbMovieDetails,
  TmdbContentRating,
  TmdbContentRatings,
  TmdbTvSeason,
  TmdbEpisode,
  TmdbSeasonDetails,
  TmdbRecommendationTv,
  TmdbSimilarTv,
  TmdbTvDetails,
  RivenEpisode,
  RivenSeason,
  RivenMediaItem,
} from "@/src/types/details";

const TMDB_BASE = "https://api.themoviedb.org/3";

async function resolveTmdbApiKey(): Promise<string | null> {
  const cookieConfig = await getTmdbConfig();
  if (cookieConfig?.apiKey) return cookieConfig.apiKey;
  return process.env.TMDB_API_KEY || null;
}

async function tmdbFetch<T>(path: string, params?: Record<string, string>): Promise<T | null> {
  const apiKey = await resolveTmdbApiKey();
  if (!apiKey) return null;

  const searchParams = new URLSearchParams({
    api_key: apiKey,
    language: "en-US",
    ...params,
  });

  const response = await fetch(`${TMDB_BASE}${path}?${searchParams}`, {
    signal: AbortSignal.timeout(12000),
    next: { revalidate: 600 },
  });

  if (!response.ok) return null;
  return response.json();
}

export async function fetchMovieDetails(tmdbId: number): Promise<TmdbMovieDetails | null> {
  return tmdbFetch<TmdbMovieDetails>(`/movie/${tmdbId}`, {
    append_to_response: "credits,recommendations,similar,videos,release_dates,images",
  });
}

export async function fetchTvDetails(tmdbId: number): Promise<TmdbTvDetails | null> {
  return tmdbFetch<TmdbTvDetails>(`/tv/${tmdbId}`, {
    append_to_response: "credits,recommendations,similar,videos,content_ratings,images",
  });
}

export async function fetchTvSeasonDetails(
  tmdbId: number,
  seasonNumber: number
): Promise<TmdbSeasonDetails | null> {
  return tmdbFetch<TmdbSeasonDetails>(`/tv/${tmdbId}/season/${seasonNumber}`);
}

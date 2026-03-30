"use server";

import { getTmdbConfig } from "./store/server-actions";
import type {
  TmdbMovie,
  TmdbTvShow,
  TmdbMediaItem,
  TmdbPaginatedResponse,
  TmdbGenre,
  TmdbGenreListResponse,
  TmdbExternalIds,
} from "@/src/types/tmdb";

const TMDB_BASE = "https://api.themoviedb.org/3";

async function resolveTmdbApiKey(): Promise<string | null> {
  const cookieConfig = await getTmdbConfig();
  if (cookieConfig?.apiKey) return cookieConfig.apiKey;
  return process.env.TMDB_API_KEY || null;
}

async function tmdbFetch<T>(path: string, params?: Record<string, string>): Promise<T | null> {
  const apiKey = await resolveTmdbApiKey();
  if (!apiKey) return null;

  const searchParams = new URLSearchParams({ api_key: apiKey, language: "en-US", ...params });
  const response = await fetch(`${TMDB_BASE}${path}?${searchParams}`, {
    signal: AbortSignal.timeout(10000),
    next: { revalidate: 600 },
  });

  if (!response.ok) return null;
  return response.json();
}

export async function fetchTrendingMovies(
  timeWindow: "day" | "week" = "week"
): Promise<TmdbMovie[]> {
  const data = await tmdbFetch<TmdbPaginatedResponse<TmdbMovie>>(
    `/trending/movie/${timeWindow}`
  );
  return data?.results ?? [];
}

export async function fetchTrendingTv(
  timeWindow: "day" | "week" = "week"
): Promise<TmdbTvShow[]> {
  const data = await tmdbFetch<TmdbPaginatedResponse<TmdbTvShow>>(
    `/trending/tv/${timeWindow}`
  );
  return data?.results ?? [];
}

export async function fetchPopularMovies(): Promise<TmdbMovie[]> {
  const data = await tmdbFetch<TmdbPaginatedResponse<TmdbMovie>>("/movie/popular");
  return data?.results ?? [];
}

export async function fetchPopularTv(): Promise<TmdbTvShow[]> {
  const data = await tmdbFetch<TmdbPaginatedResponse<TmdbTvShow>>("/tv/popular");
  return data?.results ?? [];
}

export async function fetchTopRatedMovies(): Promise<TmdbMovie[]> {
  const data = await tmdbFetch<TmdbPaginatedResponse<TmdbMovie>>("/movie/top_rated");
  return data?.results ?? [];
}

export async function fetchTopRatedTv(): Promise<TmdbTvShow[]> {
  const data = await tmdbFetch<TmdbPaginatedResponse<TmdbTvShow>>("/tv/top_rated");
  return data?.results ?? [];
}

export async function searchTmdb(query: string): Promise<TmdbMediaItem[]> {
  if (!query || query.length < 2) return [];
  const data = await tmdbFetch<TmdbPaginatedResponse<TmdbMediaItem>>("/search/multi", {
    query,
    include_adult: "false",
  });
  // Filter to movies and TV only (exclude people — Person results also have `name`)
  return (data?.results ?? []).filter(
    (item: any) => item.media_type === "movie" || item.media_type === "tv"
  );
}

export async function fetchMovieGenres(): Promise<TmdbGenre[]> {
  const data = await tmdbFetch<TmdbGenreListResponse>("/genre/movie/list");
  return data?.genres ?? [];
}

export async function fetchTvGenres(): Promise<TmdbGenre[]> {
  const data = await tmdbFetch<TmdbGenreListResponse>("/genre/tv/list");
  return data?.genres ?? [];
}

export async function fetchDiscoverMovies(
  genreId?: number,
  page: number = 1
): Promise<TmdbPaginatedResponse<TmdbMovie> | null> {
  const params: Record<string, string> = { page: String(page), sort_by: "popularity.desc" };
  if (genreId) params.with_genres = String(genreId);
  return tmdbFetch<TmdbPaginatedResponse<TmdbMovie>>("/discover/movie", params);
}

export async function fetchDiscoverTv(
  genreId?: number,
  page: number = 1
): Promise<TmdbPaginatedResponse<TmdbTvShow> | null> {
  const params: Record<string, string> = { page: String(page), sort_by: "popularity.desc" };
  if (genreId) params.with_genres = String(genreId);
  return tmdbFetch<TmdbPaginatedResponse<TmdbTvShow>>("/discover/tv", params);
}

export async function fetchTvExternalIds(tmdbId: number): Promise<TmdbExternalIds | null> {
  return tmdbFetch<TmdbExternalIds>(`/tv/${tmdbId}/external_ids`);
}

export async function isTmdbConfigured(): Promise<boolean> {
  const apiKey = await resolveTmdbApiKey();
  return apiKey !== null;
}

export interface TmdbMovie {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  popularity: number;
  adult: boolean;
  original_language: string;
  media_type?: "movie";
}

export interface TmdbTvShow {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  popularity: number;
  adult: boolean;
  original_language: string;
  origin_country: string[];
  media_type?: "tv";
}

export type TmdbMediaItem = TmdbMovie | TmdbTvShow;

export interface TmdbPaginatedResponse<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

export interface TmdbGenre {
  id: number;
  name: string;
}

export interface TmdbGenreListResponse {
  genres: TmdbGenre[];
}

export interface TmdbExternalIds {
  id: number;
  imdb_id: string | null;
  tvdb_id: number | null;
  wikidata_id: string | null;
  facebook_id: string | null;
  instagram_id: string | null;
  twitter_id: string | null;
}

/** User-facing request state (collapsed from Riven pipeline) */
export type RequestStatus = "requested" | "getting-ready" | "ready" | "failed";

export interface TrackedRequest {
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string | null;
  requestedAt: string; // ISO date
  rivenItemId?: number;
  status: RequestStatus;
  tvdbId?: number; // stored after conversion for TV
}

// Type guards
export function isTmdbMovie(item: TmdbMediaItem): item is TmdbMovie {
  return "title" in item;
}

export function isTmdbTvShow(item: TmdbMediaItem): item is TmdbTvShow {
  return "name" in item;
}

export function getTmdbTitle(item: TmdbMediaItem): string {
  return isTmdbMovie(item) ? item.title : item.name;
}

export function getTmdbYear(item: TmdbMediaItem): string | undefined {
  const date = isTmdbMovie(item) ? item.release_date : item.first_air_date;
  return date ? date.substring(0, 4) : undefined;
}

export function getTmdbMediaType(item: TmdbMediaItem): "movie" | "tv" {
  if (item.media_type) return item.media_type;
  return isTmdbMovie(item) ? "movie" : "tv";
}

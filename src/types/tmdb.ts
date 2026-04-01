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

/** Returned by TMDB multi-search for person results */
export interface TmdbPerson {
  id: number;
  name: string;
  profile_path: string | null;
  popularity: number;
  known_for_department: string;
  media_type: "person";
}

/** Returned by TMDB multi-search for company/studio results */
export interface TmdbCompany {
  id: number;
  name: string;
  logo_path: string | null;
  origin_country: string;
  media_type: "company";
}

/** All result types from TMDB multi-search */
export type TmdbSearchResult = TmdbMediaItem | TmdbPerson | TmdbCompany;

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

/** True for movie results (from trending, search, or discover endpoints) */
export function isTmdbMovie(item: TmdbSearchResult): item is TmdbMovie {
  // media_type="movie" is definitive when present
  if ((item as any).media_type === "movie") return true;
  // When media_type is absent, use structural check: movies have `title`, TV shows have `first_air_date`
  if (!(item as any).media_type) {
    return "title" in item && !("first_air_date" in item);
  }
  return false;
}

/** True for TV show results */
export function isTmdbTvShow(item: TmdbSearchResult): item is TmdbTvShow {
  if ((item as any).media_type === "tv") return true;
  if (!(item as any).media_type) {
    return "first_air_date" in item;
  }
  return false;
}

export function isTmdbPerson(item: TmdbSearchResult): item is TmdbPerson {
  return (item as any).media_type === "person";
}

export function isTmdbCompany(item: TmdbSearchResult): item is TmdbCompany {
  return (item as any).media_type === "company";
}

export function getTmdbTitle(item: TmdbSearchResult): string {
  // media_type is the most reliable discriminator when present
  if ((item as any).media_type === "movie") return (item as TmdbMovie).title;
  if ((item as any).media_type === "tv") return (item as TmdbTvShow).name;
  if ((item as any).media_type === "person") return (item as TmdbPerson).name;
  if ((item as any).media_type === "company") return (item as TmdbCompany).name;
  // Fallback for items without explicit media_type (e.g. TmdbMovie/TmdbTvShow from trending endpoints)
  if ("title" in item) return (item as TmdbMovie).title;
  if ("name" in item) return (item as TmdbTvShow).name;
  return "";
}

export function getTmdbYear(item: TmdbSearchResult): string | undefined {
  if (isTmdbMovie(item)) return item.release_date ? item.release_date.substring(0, 4) : undefined;
  if (isTmdbTvShow(item)) return item.first_air_date ? item.first_air_date.substring(0, 4) : undefined;
  return undefined;
}

export function getTmdbMediaType(item: TmdbSearchResult): "movie" | "tv" | "person" | "company" {
  if ((item as any).media_type) return (item as any).media_type;
  if (isTmdbMovie(item)) return "movie";
  if (isTmdbTvShow(item)) return "tv";
  return "movie"; // fallback
}

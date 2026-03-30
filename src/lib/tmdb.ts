import type { RequestStatus } from "@/src/types/tmdb";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

export const TMDB_POSTER_SIZES = {
  small: "w185",
  medium: "w342",
  large: "w500",
  original: "original",
} as const;

export const TMDB_BACKDROP_SIZES = {
  small: "w300",
  medium: "w780",
  large: "w1280",
  original: "original",
} as const;

export function tmdbPosterUrl(
  posterPath: string | null,
  size: keyof typeof TMDB_POSTER_SIZES = "medium"
): string | undefined {
  if (!posterPath) return undefined;
  return `${TMDB_IMAGE_BASE}/${TMDB_POSTER_SIZES[size]}${posterPath}`;
}

export function tmdbBackdropUrl(
  backdropPath: string | null,
  size: keyof typeof TMDB_BACKDROP_SIZES = "large"
): string | undefined {
  if (!backdropPath) return undefined;
  return `${TMDB_IMAGE_BASE}/${TMDB_BACKDROP_SIZES[size]}${backdropPath}`;
}

/** Collapse Riven pipeline states into user-facing states */
export function rivenStateToRequestStatus(rivenState: string): RequestStatus {
  switch (rivenState) {
    case "Requested":
    case "Indexed":
      return "requested";
    case "Scraped":
    case "Downloaded":
    case "Symlinked":
      return "getting-ready";
    case "Completed":
    case "PartiallyCompleted":
      return "ready";
    case "Failed":
      return "failed";
    default:
      return "requested";
  }
}

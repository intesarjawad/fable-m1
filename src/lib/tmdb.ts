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

/**
 * Seerr media status enum:
 *   1 Unknown · 2 Pending · 3 Processing · 4 Partially Available · 5 Available
 */
export const SEERR_STATUS = {
  Unknown: 1,
  Pending: 2,
  Processing: 3,
  PartiallyAvailable: 4,
  Available: 5,
} as const;

/** Map Seerr's numeric status to a user-facing RequestStatus. */
export function seerrStatusToRequestStatus(status: number | null | undefined): RequestStatus {
  switch (status) {
    case SEERR_STATUS.Pending:
      return "requested";
    case SEERR_STATUS.Processing:
      return "getting-ready";
    case SEERR_STATUS.PartiallyAvailable:
    case SEERR_STATUS.Available:
      return "ready";
    default:
      return "requested";
  }
}

/** Map Seerr's numeric status to the badge label rendered by StatusBadge. */
export function seerrStatusToBadgeLabel(status: number | null | undefined): string | null {
  switch (status) {
    case SEERR_STATUS.Pending:
      return "Requested";
    case SEERR_STATUS.Processing:
      return "Downloading";
    case SEERR_STATUS.PartiallyAvailable:
      return "PartiallyCompleted";
    case SEERR_STATUS.Available:
      return "Completed";
    default:
      return null;
  }
}

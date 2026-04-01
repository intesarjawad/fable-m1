// ─── Genre ──────────────────────────────────────────────────────────────────

export interface TmdbGenreDetail {
  id: number;
  name: string;
}

// ─── Credits ────────────────────────────────────────────────────────────────

export interface TmdbCastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  order: number;
}

export interface TmdbCrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
  profile_path: string | null;
}

export interface TmdbCredits {
  cast: TmdbCastMember[];
  crew: TmdbCrewMember[];
}

// ─── Videos ─────────────────────────────────────────────────────────────────

export interface TmdbVideo {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
}

export interface TmdbVideoResults {
  results: TmdbVideo[];
}

// ─── Images ─────────────────────────────────────────────────────────────────

export interface TmdbLogoImage {
  file_path: string;
  iso_639_1: string | null;
  vote_average: number;
}

export interface TmdbImageResults {
  logos?: TmdbLogoImage[];
}

// ─── Movie detail ────────────────────────────────────────────────────────────

export interface TmdbReleaseDate {
  certification: string;
  release_date: string;
  type: number;
}

export interface TmdbReleaseDateEntry {
  iso_3166_1: string;
  release_dates: TmdbReleaseDate[];
}

export interface TmdbReleaseDates {
  results: TmdbReleaseDateEntry[];
}

export interface TmdbProductionCompany {
  id: number;
  name: string;
  logo_path: string | null;
}

export interface TmdbRecommendationMovie {
  id: number;
  title: string;
  poster_path: string | null;
  media_type: "movie";
  release_date?: string;
}

export interface TmdbSimilarMovie {
  id: number;
  title: string;
  poster_path: string | null;
  media_type?: "movie";
  release_date?: string;
}

export interface TmdbMovieDetails {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  runtime: number | null;
  vote_average: number;
  vote_count: number;
  status: string;
  original_language: string;
  budget: number;
  revenue: number;
  genres: TmdbGenreDetail[];
  production_companies: TmdbProductionCompany[];
  credits: TmdbCredits;
  videos: TmdbVideoResults;
  images: TmdbImageResults;
  release_dates: TmdbReleaseDates;
  recommendations: { results: TmdbRecommendationMovie[] };
  similar: { results: TmdbSimilarMovie[] };
}

// ─── TV detail ────────────────────────────────────────────────────────────────

export interface TmdbContentRating {
  iso_3166_1: string;
  rating: string;
}

export interface TmdbContentRatings {
  results: TmdbContentRating[];
}

export interface TmdbTvSeason {
  id: number;
  season_number: number;
  name: string;
  overview: string;
  poster_path: string | null;
  air_date: string | null;
  episode_count: number;
}

export interface TmdbEpisode {
  id: number;
  name: string;
  overview: string;
  episode_number: number;
  season_number: number;
  still_path: string | null;
  air_date: string | null;
  runtime: number | null;
  vote_average: number;
}

export interface TmdbSeasonDetails {
  id: number;
  season_number: number;
  name: string;
  overview: string;
  poster_path: string | null;
  air_date: string | null;
  episodes: TmdbEpisode[];
}

export interface TmdbRecommendationTv {
  id: number;
  name: string;
  poster_path: string | null;
  media_type: "tv";
  first_air_date?: string;
}

export interface TmdbSimilarTv {
  id: number;
  name: string;
  poster_path: string | null;
  media_type?: "tv";
  first_air_date?: string;
}

export interface TmdbTvDetails {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  last_air_date: string | null;
  vote_average: number;
  vote_count: number;
  status: string;
  original_language: string;
  number_of_seasons: number;
  number_of_episodes: number;
  episode_run_time: number[];
  genres: TmdbGenreDetail[];
  production_companies: TmdbProductionCompany[];
  seasons: TmdbTvSeason[];
  credits: TmdbCredits;
  videos: TmdbVideoResults;
  images: TmdbImageResults;
  content_ratings: TmdbContentRatings;
  recommendations: { results: TmdbRecommendationTv[] };
  similar: { results: TmdbSimilarTv[] };
}

// ─── Riven item shape (extended=true) ────────────────────────────────────────

export interface RivenEpisode {
  id: number;
  episode_number: number;
  state: string;
  filesystem_entry?: {
    file_size?: number;
  } | null;
  media_metadata?: {
    filename?: string;
    quality_source?: string;
    is_remux?: boolean;
    video?: {
      resolution_width?: number;
      resolution_height?: number;
      codec?: string;
      hdr_type?: string;
    };
    audio_tracks?: Array<{
      codec?: string;
      channels?: number;
      language?: string;
    }>;
  } | null;
}

export interface RivenSeason {
  id: number;
  season_number: number;
  state: string;
  episodes?: RivenEpisode[];
}

export interface RivenMediaItem {
  id: number;
  state: string;
  seasons?: RivenSeason[];
}

// ─── Pure helper functions ────────────────────────────────────────────────────

/** Pull the best trailer key from a video results list (YouTube official first). */
export function extractTrailerKey(videos: TmdbVideoResults): string | null {
  const youtubeVideos = videos.results.filter((v) => v.site === "YouTube");

  const officialTrailer = youtubeVideos.find(
    (v) => v.type === "Trailer" && v.official
  );
  if (officialTrailer) return officialTrailer.key;

  const anyTrailer = youtubeVideos.find((v) => v.type === "Trailer");
  if (anyTrailer) return anyTrailer.key;

  const teaser = youtubeVideos.find((v) => v.type === "Teaser");
  if (teaser) return teaser.key;

  return youtubeVideos[0]?.key ?? null;
}

/** Pick the best English logo path from images.logos. Falls back to any logo. */
export function extractLogoPath(images: TmdbImageResults): string | null {
  if (!images.logos?.length) return null;

  const englishLogo = images.logos.find((logo) => logo.iso_639_1 === "en");
  if (englishLogo) return englishLogo.file_path;

  const highestRated = images.logos.reduce(
    (best, logo) => (logo.vote_average > best.vote_average ? logo : best),
    images.logos[0]
  );
  return highestRated?.file_path ?? null;
}

/** Extract US certification from release_dates, or first available. */
export function extractMovieCertification(releaseDates: TmdbReleaseDates): string | null {
  const usDates = releaseDates.results.find((entry) => entry.iso_3166_1 === "US");
  if (usDates) {
    // Type 3 = theatrical release
    const theatricalRelease = usDates.release_dates.find((rd) => rd.type === 3);
    const certifiedRelease = theatricalRelease ?? usDates.release_dates.find((rd) => rd.certification);
    const certification = certifiedRelease?.certification;
    if (certification) return certification;
  }

  // Fall back to first country with a rating
  for (const entry of releaseDates.results) {
    for (const rd of entry.release_dates) {
      if (rd.certification) return rd.certification;
    }
  }

  return null;
}

/** Extract US content rating for TV, or first available. */
export function extractTvCertification(contentRatings: TmdbContentRatings): string | null {
  const usRating = contentRatings.results.find((entry) => entry.iso_3166_1 === "US");
  if (usRating?.rating) return usRating.rating;

  return contentRatings.results.find((entry) => entry.rating)?.rating ?? null;
}

/** Format runtime minutes as "1h 54m". */
export function formatRuntime(minutes: number | null | undefined): string | null {
  if (!minutes) return null;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours === 0) return `${remainingMinutes}m`;
  if (remainingMinutes === 0) return `${hours}h`;
  return `${hours}h ${remainingMinutes}m`;
}

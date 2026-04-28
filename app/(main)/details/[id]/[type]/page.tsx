"use client";

import { useEffect, useState, useCallback, Fragment } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Play, X, Download, Loader2, Heart, MessageSquare } from "lucide-react";
import { toast } from "sonner";

import { tmdbPosterUrl, tmdbBackdropUrl, seerrStatusToBadgeLabel, SEERR_STATUS } from "@/src/lib/tmdb";
import { useJellyfinTmdbMap } from "@/src/hooks/use-jellyfin-tmdb-map";
import { useIsMobile } from "@/src/hooks/use-mobile";
import { requestMovie, requestTvShow } from "@/src/actions/request";
import { findJellyfinEpisodeId, fetchJellyfinSeasonEpisodes } from "@/src/actions/media";
import { markFavorite, unmarkFavorite } from "@/src/actions";
import { usePlayback } from "@/src/hooks/usePlayback";

import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/src/components/ui/sheet";

import { PortraitCard, PortraitCardSkeleton } from "@/src/components/media/portrait-card";
import { StatusBadge } from "@/src/components/media/status-badge";
import { DownloadProgress } from "@/src/components/media/download-progress";
import { EpisodeCard } from "@/src/components/media/episode-card";
import { MediaLink } from "@/src/components/media/media-link";
import { ReportIssueDialog } from "@/src/components/media/report-issue-dialog";

import {
  fetchMovieDetails,
  fetchTvDetails,
  fetchTvSeasonDetails,
  resolveTvdbToTmdb,
} from "@/src/actions/details";

import {
  extractTrailerKey,
  extractLogoPath,
  extractMovieCertification,
  extractTvCertification,
  formatRuntime,
  type TmdbMovieDetails,
  type TmdbTvDetails,
  type TmdbSeasonDetails,
  type TmdbEpisode,
  type MediaAvailability,
  type MediaSeasonAvailability,
} from "@/src/types/details";

// ─── Rating types ────────────────────────────────────────────────────────────

interface RatingScore {
  name: string;
  image?: string;
  score: string | number;
  url: string;
}

interface RatingsResponse {
  scores: RatingScore[];
}

// ─── Section heading ─────────────────────────────────────────────────────────

function SectionHeading({ title }: { title: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <div className="bg-primary h-6 w-1 rounded-full shadow-[0_0_10px_rgba(var(--primary),0.5)]" />
      <h2 className="text-foreground text-xl font-bold tracking-tight drop-shadow-md">
        {title}
      </h2>
    </div>
  );
}

// ─── Horizontal media carousel ────────────────────────────────────────────────

interface CarouselItem {
  id: number;
  title: string;
  posterPath: string | null;
  mediaType: "movie" | "tv";
  year?: string | null;
}

function MediaCarousel({
  items,
  title,
}: {
  items: CarouselItem[];
  title: string;
}) {
  if (!items.length) return null;

  return (
    <section className="mt-8 md:mt-12">
      <SectionHeading title={title} />
      <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-none">
        {items.map((item) => (
          <MediaLink
            key={item.id}
            id={item.id}
            mediaType={item.mediaType}
            className="shrink-0 opacity-80 transition-opacity duration-300 hover:opacity-100"
          >
            <PortraitCard
              title={item.title}
              subtitle={`${item.mediaType === "tv" ? "TV" : "Movie"}${item.year ? ` \u2022 ${item.year}` : ""}`}
              posterUrl={tmdbPosterUrl(item.posterPath, "medium")}
              className="w-36 md:w-44 lg:w-48"
            />
          </MediaLink>
        ))}
      </div>
    </section>
  );
}

// ─── Episode detail sheet ─────────────────────────────────────────────────────

interface EpisodeSheetProps {
  episode: TmdbEpisode | null;
  showTitle: string;
  isOpen: boolean;
  onClose: () => void;
  onPlay?: () => void;
  isMobile: boolean;
}

function EpisodeDetailSheet({
  episode,
  showTitle,
  isOpen,
  onClose,
  onPlay,
  isMobile,
}: EpisodeSheetProps) {
  if (!episode) return null;

  const stillUrl = episode.still_path
    ? `https://image.tmdb.org/t/p/w780${episode.still_path}`
    : null;

  const sheetSide = isMobile ? "bottom" : "right";
  const sheetClassName = isMobile
    ? "max-h-[85vh] overflow-y-auto border-t border-white/10 bg-zinc-950/95 backdrop-blur-2xl"
    : "flex w-full flex-col overflow-hidden border-l border-white/10 bg-zinc-950/95 backdrop-blur-2xl sm:max-w-xl md:max-w-2xl lg:max-w-3xl";

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side={sheetSide} className={sheetClassName}>
        <SheetHeader className="px-6 pt-6 shrink-0">
          <SheetTitle className="text-2xl font-bold tracking-tight">
            S{String(episode.season_number).padStart(2, "0")}E
            {String(episode.episode_number).padStart(2, "0")} &mdash;{" "}
            {episode.name}
          </SheetTitle>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground font-serif text-sm">
              {showTitle}
            </span>
            <span className="text-muted-foreground">&bull;</span>
            {episode.air_date && (
              <Badge variant="outline" className="font-mono text-xs">
                {episode.air_date}
              </Badge>
            )}
            {episode.runtime && (
              <Badge variant="outline" className="font-mono text-xs">
                {episode.runtime} min
              </Badge>
            )}
          </div>
        </SheetHeader>

        <div className="mt-6 flex flex-1 flex-col gap-8 overflow-y-auto px-6 pb-12">
          {episode.overview && (
            <p className="text-muted-foreground text-base leading-relaxed">
              {episode.overview}
            </p>
          )}

          {stillUrl && (
            <div
              className={`relative w-full max-w-[640px] overflow-hidden rounded-xl shadow-lg ring-1 ring-white/10 group${onPlay ? " cursor-pointer" : ""}`}
              onClick={onPlay}
            >
              <Image
                src={stillUrl}
                alt={episode.name}
                width={640}
                height={360}
                className="aspect-video w-full object-cover"
                unoptimized
              />
              {onPlay && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 transition-colors group-hover:bg-black/50">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary shadow-lg transition-transform group-hover:scale-110">
                    <Play className="h-7 w-7 fill-primary-foreground text-primary-foreground ml-1" />
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Skeleton loading state ───────────────────────────────────────────────────

function DetailPageSkeleton() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden">
      <div className="px-2 md:px-4">
        <Skeleton className="h-[40vh] max-h-[600px] min-h-[350px] w-full rounded-3xl" />
      </div>
      <div className="mt-6 px-8 pb-24 md:px-20 lg:px-24">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[auto_1fr]">
          <PortraitCardSkeleton className="hidden w-48 lg:block lg:w-64" />
          <div className="flex flex-col gap-4">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-1/2" />
            <div className="flex gap-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-6 w-16 rounded-full" />
              ))}
            </div>
            <Skeleton className="h-28 w-full max-w-4xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main page component ──────────────────────────────────────────────────────

export default function MediaDetailPage() {
  const params = useParams<{ id: string; type: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();

  const rawId = Number(params.id);
  const indexer = searchParams.get("indexer");
  const mediaType = params.type as "movie" | "tv";

  const { tmdbMap, tvdbMap } = useJellyfinTmdbMap();
  const { play } = usePlayback();

  // For TVDB-indexed URLs, the raw ID is a TVDB ID.
  // resolvedTmdbId starts null for TVDB lookups, gets resolved async.
  const [resolvedTmdbId, setResolvedTmdbId] = useState<number | null>(
    indexer === "tvdb" ? null : rawId,
  );

  // Core data
  const [movieDetails, setMovieDetails] = useState<TmdbMovieDetails | null>(null);
  const [tvDetails, setTvDetails] = useState<TmdbTvDetails | null>(null);
  const [availability, setAvailability] = useState<MediaAvailability | null>(null);
  const [resolvedTvdbId, setResolvedTvdbId] = useState<number | null>(
    indexer === "tvdb" ? rawId : null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Season/episode state
  const [selectedSeasonNumber, setSelectedSeasonNumber] = useState<number>(1);
  const [seasonEpisodes, setSeasonEpisodes] = useState<TmdbEpisode[]>([]);
  const [seasonEpisodesLoading, setSeasonEpisodesLoading] = useState(false);
  // Jellyfin episode-id map for the currently selected season:
  // { episode_number → jellyfin_id }. Drives the per-episode "available" badge
  // and lets us short-circuit findJellyfinEpisodeId on play.
  const [seasonJellyfinEpisodes, setSeasonJellyfinEpisodes] = useState<Record<number, string>>({});

  // UI state
  const [showTrailer, setShowTrailer] = useState(false);
  const [requestingMovie, setRequestingMovie] = useState(false);
  const [requestingTvShow, setRequestingTvShow] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [issueDialogOpen, setIssueDialogOpen] = useState(false);
  const [togglingFavorite, setTogglingFavorite] = useState(false);

  // Episode sheet state
  const [selectedEpisode, setSelectedEpisode] = useState<TmdbEpisode | null>(null);
  const [isEpisodeSheetOpen, setIsEpisodeSheetOpen] = useState(false);
  const [episodeJellyfinId, setEpisodeJellyfinId] = useState<string | null>(null);

  // Ratings
  const [ratingsData, setRatingsData] = useState<RatingsResponse | null>(null);
  const [ratingsLoading, setRatingsLoading] = useState(false);

  // ─── Data loading ─────────────────────────────────────────────────────────

  // Resolve TVDB -> TMDB when the indexer param says tvdb
  useEffect(() => {
    if (indexer !== "tvdb") return;

    setIsLoading(true);
    setLoadError(null);

    resolveTvdbToTmdb(rawId).then((tmdbId) => {
      if (!tmdbId) {
        setLoadError("Could not resolve TVDB ID to a TMDB entry.");
        setIsLoading(false);
        return;
      }
      setResolvedTmdbId(tmdbId);
    });
  }, [rawId, indexer]);

  // Fetch TMDB details first, then use the correct ID for Riven lookup
  useEffect(() => {
    if (resolvedTmdbId === null) return;

    if (isNaN(resolvedTmdbId) || (mediaType !== "movie" && mediaType !== "tv")) {
      setLoadError("Invalid media ID or type.");
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();

    async function loadData() {
      setIsLoading(true);
      setLoadError(null);

      try {
        // Step 1: Fetch TMDB details
        const details = mediaType === "movie"
          ? await fetchMovieDetails(resolvedTmdbId!)
          : await fetchTvDetails(resolvedTmdbId!);

        if (!details) {
          setLoadError("Could not load details. Check your TMDB configuration.");
          return;
        }

        if (mediaType === "movie") {
          setMovieDetails(details as TmdbMovieDetails);
        } else {
          const tvData = details as TmdbTvDetails;
          setTvDetails(tvData);

          const firstRealSeason =
            tvData.seasons.find((s) => s.season_number === 1) ??
            tvData.seasons.find((s) => s.season_number > 0) ??
            tvData.seasons[0];

          if (firstRealSeason) {
            setSelectedSeasonNumber(firstRealSeason.season_number);
          }
        }

        // Step 2: Resolve TVDB ID for TV (used to look up Jellyfin items
        // when Jellyfin only has the TVDB provider id).
        if (mediaType === "tv" && indexer !== "tvdb") {
          const tvdbId = (details as TmdbTvDetails).external_ids?.tvdb_id;
          if (tvdbId) setResolvedTvdbId(tvdbId);
        }

        // Step 3: Fetch Seerr availability (mediaInfo.status + per-season status)
        const seerrResponse = await fetch(
          `/api/seerr/media/${mediaType}/${resolvedTmdbId}`,
        )
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);

        const mediaInfo = seerrResponse?.mediaInfo;
        if (mediaInfo?.status && mediaInfo.status !== SEERR_STATUS.Unknown) {
          const stateLabel = seerrStatusToBadgeLabel(mediaInfo.status);
          if (stateLabel) {
            const seasons: MediaSeasonAvailability[] = (seerrResponse?.seasons ?? [])
              .map((s: { seasonNumber: number; status: number }) => {
                const seasonLabel = seerrStatusToBadgeLabel(s.status);
                return seasonLabel
                  ? {
                      season_number: s.seasonNumber,
                      state: seasonLabel,
                      rawStatus: s.status,
                    }
                  : null;
              })
              .filter((s: MediaSeasonAvailability | null): s is MediaSeasonAvailability => s !== null);

            const downloads = Array.isArray(mediaInfo.downloadStatus)
              ? mediaInfo.downloadStatus
                  .filter(
                    (d: { size?: number; sizeLeft?: number }) =>
                      typeof d.size === "number" && typeof d.sizeLeft === "number",
                  )
                  .map(
                    (d: {
                      title?: string;
                      size?: number;
                      sizeLeft?: number;
                      estimatedCompletionTime?: string | null;
                    }) => ({
                      title: d.title ?? "Unknown release",
                      size: d.size as number,
                      sizeLeft: d.sizeLeft as number,
                      estimatedCompletionTime: d.estimatedCompletionTime ?? null,
                    }),
                  )
              : [];

            const requests = Array.isArray(mediaInfo.requests)
              ? mediaInfo.requests.map(
                  (r: {
                    id: number;
                    status: number;
                    is4k?: boolean;
                    createdAt?: string;
                    requestedBy?: { displayName?: string };
                  }) => ({
                    id: r.id,
                    status: r.status,
                    is4k: !!r.is4k,
                    createdAt: r.createdAt,
                    requestedByName: r.requestedBy?.displayName,
                  }),
                )
              : [];

            setAvailability({
              state: stateLabel,
              rawStatus: mediaInfo.status,
              seasons,
              downloads,
              seerrMediaId: typeof mediaInfo.id === "number" ? mediaInfo.id : undefined,
              requests,
            });
          }
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setLoadError(
            err instanceof Error ? err.message : "Failed to load details.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    loadData();
    return () => controller.abort();
  }, [resolvedTmdbId, mediaType, rawId, indexer]);

  // ─── Ratings loading ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!resolvedTmdbId || isNaN(resolvedTmdbId)) return;

    const controller = new AbortController();
    setRatingsLoading(true);

    fetch(`/api/ratings/${resolvedTmdbId}?type=${mediaType}`, {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: RatingsResponse | null) => {
        setRatingsData(data);
        setRatingsLoading(false);
      })
      .catch((err) => {
        if (err?.name !== "AbortError") {
          setRatingsData(null);
          setRatingsLoading(false);
        }
      });

    return () => controller.abort();
  }, [resolvedTmdbId, mediaType]);

  // ─── Watchlist (Jellyfin favorite) ───────────────────────────────────────

  // Declared here (rather than in the computed values block below) so the
  // Watchlist effect and callback can reference it without a forward-reference error.
  const jellyfinEntry =
    (resolvedTmdbId ? tmdbMap.get(resolvedTmdbId) : undefined) ??
    (resolvedTvdbId ? tvdbMap.get(resolvedTvdbId) : undefined);

  // jellyfinEntry loads asynchronously (tmdbMap populates after mount),
  // so we sync isFavorite whenever it becomes available. The map currently
  // doesn't carry UserData, so we default to false until the user toggles.
  useEffect(() => {
    setIsFavorite(false);
  }, [jellyfinEntry]);

  const handleToggleFavorite = useCallback(async () => {
    if (!jellyfinEntry) return;
    setTogglingFavorite(true);
    const jellyfinItemId = jellyfinEntry.jellyfinId;
    try {
      const succeeded = isFavorite
        ? await unmarkFavorite(jellyfinItemId)
        : await markFavorite(jellyfinItemId);
      if (succeeded) {
        setIsFavorite((prev) => !prev);
        toast.success(isFavorite ? `Removed from Watchlist` : `Added to Watchlist`);
      } else {
        toast.error("Failed to update Watchlist");
      }
    } catch {
      toast.error("Failed to update Watchlist");
    } finally {
      setTogglingFavorite(false);
    }
  }, [jellyfinEntry, isFavorite]);

  // ─── Season episode loading ───────────────────────────────────────────────

  useEffect(() => {
    if (mediaType !== "tv" || !tvDetails || !resolvedTmdbId) return;

    const controller = new AbortController();
    setSeasonEpisodesLoading(true);

    fetchTvSeasonDetails(resolvedTmdbId, selectedSeasonNumber)
      .then((season: TmdbSeasonDetails | null) => {
        if (!controller.signal.aborted) {
          setSeasonEpisodes(season?.episodes ?? []);
          setSeasonEpisodesLoading(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSeasonEpisodes([]);
          setSeasonEpisodesLoading(false);
        }
      });

    return () => controller.abort();
  }, [resolvedTmdbId, mediaType, tvDetails, selectedSeasonNumber]);

  // ─── Per-season Jellyfin availability ─────────────────────────────────────
  // Pull the Jellyfin episode map for the active season so episode cards can
  // show an "available" badge and play directly without an extra round trip.
  useEffect(() => {
    if (mediaType !== "tv" || !jellyfinEntry?.jellyfinId) {
      setSeasonJellyfinEpisodes({});
      return;
    }

    let cancelled = false;
    fetchJellyfinSeasonEpisodes(jellyfinEntry.jellyfinId, selectedSeasonNumber)
      .then((map) => {
        if (!cancelled) setSeasonJellyfinEpisodes(map);
      })
      .catch(() => {
        if (!cancelled) setSeasonJellyfinEpisodes({});
      });

    return () => {
      cancelled = true;
    };
  }, [mediaType, jellyfinEntry?.jellyfinId, selectedSeasonNumber]);

  // ─── Computed values ──────────────────────────────────────────────────────

  const backdropUrl = movieDetails
    ? tmdbBackdropUrl(movieDetails.backdrop_path, "large")
    : tvDetails
      ? tmdbBackdropUrl(tvDetails.backdrop_path, "large")
      : null;

  const posterPath = movieDetails?.poster_path ?? tvDetails?.poster_path ?? null;
  const posterUrl = tmdbPosterUrl(posterPath, "large");

  const title = movieDetails?.title ?? tvDetails?.name ?? "";
  const overview = movieDetails?.overview ?? tvDetails?.overview ?? "";

  const logoPath = movieDetails?.images
    ? extractLogoPath(movieDetails.images)
    : tvDetails?.images
      ? extractLogoPath(tvDetails.images)
      : null;
  const logoUrl = logoPath
    ? `https://image.tmdb.org/t/p/w300${logoPath}`
    : null;

  const trailerKey = movieDetails?.videos
    ? extractTrailerKey(movieDetails.videos)
    : tvDetails?.videos
      ? extractTrailerKey(tvDetails.videos)
      : null;

  const genres = movieDetails?.genres ?? tvDetails?.genres ?? [];

  const releaseYear = movieDetails?.release_date
    ? movieDetails.release_date.substring(0, 4)
    : tvDetails?.first_air_date
      ? tvDetails.first_air_date.substring(0, 4)
      : null;

  const runtimeDisplay = movieDetails
    ? formatRuntime(movieDetails.runtime)
    : tvDetails?.episode_run_time?.[0]
      ? formatRuntime(tvDetails.episode_run_time[0])
      : null;

  const originalLanguage = (
    movieDetails?.original_language ??
    tvDetails?.original_language ??
    ""
  ).toUpperCase();

  const certification = movieDetails?.release_dates
    ? extractMovieCertification(movieDetails.release_dates)
    : tvDetails?.content_ratings
      ? extractTvCertification(tvDetails.content_ratings)
      : null;

  const tvStatus = tvDetails?.status ?? null;

  const metaItems = [
    releaseYear,
    runtimeDisplay,
    originalLanguage || null,
    certification,
    tvStatus,
  ].filter(Boolean);

  const castMembers = movieDetails?.credits.cast ?? tvDetails?.credits.cast ?? [];
  const recommendations =
    movieDetails?.recommendations.results ??
    tvDetails?.recommendations.results ??
    [];
  const similarItems =
    movieDetails?.similar.results ?? tvDetails?.similar.results ?? [];

  // ─── Actions ──────────────────────────────────────────────────────────────

  const handlePlay = useCallback(() => {
    if (!jellyfinEntry) {
      toast.error("Playback source not found — content may still be syncing to Jellyfin");
      return;
    }
    play({
      id: jellyfinEntry.jellyfinId,
      name: title,
      type: mediaType === "movie" ? "Movie" : "Series",
    });
  }, [jellyfinEntry, play, title, mediaType]);

  const handleMovieRequest = useCallback(async () => {
    if (!resolvedTmdbId) return;
    setRequestingMovie(true);
    try {
      const result = await requestMovie(resolvedTmdbId);
      if (result.success) {
        toast.success(`${title} requested`);
      } else {
        toast.error(result.message);
      }
    } catch {
      toast.error("Failed to submit request");
    } finally {
      setRequestingMovie(false);
    }
  }, [resolvedTmdbId, title]);

  const handleTvRequest = useCallback(async () => {
    if (!resolvedTmdbId) return;
    setRequestingTvShow(true);
    try {
      const result = await requestTvShow(resolvedTmdbId);
      if (result.success) {
        toast.success(`${title} requested`);
      } else {
        toast.error(result.message);
      }
    } catch {
      toast.error("Failed to submit request");
    } finally {
      setRequestingTvShow(false);
    }
  }, [resolvedTmdbId, title]);

  const handleEpisodeClick = useCallback(
    async (episode: TmdbEpisode) => {
      // Prefer the prefetched per-season map; fall back to a single lookup
      // if this episode isn't in the map yet (e.g. another season is open).
      let resolvedJellyfinId: string | null =
        seasonJellyfinEpisodes[episode.episode_number] ?? null;

      if (!resolvedJellyfinId && jellyfinEntry) {
        try {
          resolvedJellyfinId = await findJellyfinEpisodeId(
            jellyfinEntry.jellyfinId,
            episode.season_number,
            episode.episode_number,
          ) ?? null;
        } catch {
          // Ignore — sheet will just not show play overlay
        }
      }

      setEpisodeJellyfinId(resolvedJellyfinId);
      setSelectedEpisode(episode);
      setIsEpisodeSheetOpen(true);
    },
    [jellyfinEntry, seasonJellyfinEpisodes],
  );

  const handleEpisodePlay = useCallback(async () => {
    let targetId = episodeJellyfinId;
    if (!targetId && jellyfinEntry && selectedEpisode) {
      try {
        targetId = await findJellyfinEpisodeId(
          jellyfinEntry.jellyfinId,
          selectedEpisode.season_number,
          selectedEpisode.episode_number,
        ) ?? null;
      } catch { /* fall through */ }
    }
    if (!targetId) {
      toast.error("Unable to find playback source");
      return;
    }
    const episodeName = selectedEpisode
      ? `S${String(selectedEpisode.season_number).padStart(2, "0")}E${String(selectedEpisode.episode_number).padStart(2, "0")} ${selectedEpisode.name}`
      : "Episode";
    play({ id: targetId, name: episodeName, type: "Episode" });
  }, [episodeJellyfinId, jellyfinEntry, selectedEpisode, play]);

  // ─── Render ───────────────────────────────────────────────────────────────

  if (isLoading) return <DetailPageSkeleton />;

  if (loadError) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-8">
        <div className="text-center">
          <p className="text-muted-foreground text-lg">{loadError}</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => router.back()}
          >
            Go back
          </Button>
        </div>
      </div>
    );
  }

  // Seerr is the source of truth for request/availability state.
  const isTracked = availability !== null;
  const isAvailable =
    availability?.rawStatus === SEERR_STATUS.Available ||
    availability?.rawStatus === SEERR_STATUS.PartiallyAvailable;
  // Jellyfin entry is what actually unlocks playback; Seerr "Available" is a hint.
  const canPlay = isAvailable || jellyfinEntry !== undefined;

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden">
      {/* Fixed blurred backdrop */}
      {backdropUrl && (
        <div className="pointer-events-none fixed top-0 left-0 z-0 h-screen w-full">
          <Image
            src={backdropUrl}
            alt=""
            fill
            unoptimized
            priority
            className="object-cover opacity-30 blur-3xl"
          />
          <div className="bg-background/80 absolute inset-0 mix-blend-multiply" />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/50 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/20 via-transparent to-transparent" />
        </div>
      )}

      <div className="relative z-10 mx-auto flex h-full w-full max-w-[2400px] flex-col">
        {/* ── Hero banner ─────────────────────────────────────────────────── */}
        {backdropUrl && (
          <div className="px-2 md:px-4">
            <div
              className="relative mb-6 flex h-[40vh] max-h-[600px] min-h-[350px] items-end justify-between overflow-hidden rounded-3xl bg-cover bg-center shadow-2xl transition-all duration-500 md:mb-10"
              style={
                !showTrailer
                  ? {
                      backgroundImage: `url('${backdropUrl}')`,
                      padding: "1.5rem",
                    }
                  : { backgroundImage: `url('${backdropUrl}')` }
              }
            >
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
              {/* Border overlay */}
              <div className="border-border/10 pointer-events-none absolute inset-0 rounded-3xl border" />

              {!showTrailer ? (
                <div className="relative z-10 flex w-full items-end justify-between md:p-6">
                  {/* Logo bottom-left */}
                  {logoUrl ? (
                    <Image
                      src={logoUrl}
                      alt={`${title} logo`}
                      width={300}
                      height={144}
                      unoptimized
                      className="max-h-16 max-w-[60%] object-contain drop-shadow-2xl md:max-h-28 lg:max-h-36"
                    />
                  ) : (
                    <div />
                  )}

                  {/* Trailer button bottom-right */}
                  <div className="flex gap-2 md:gap-4">
                    {trailerKey && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setShowTrailer(true)}
                        className="border border-white/10 bg-white/10 px-6 text-sm font-bold text-white shadow-lg backdrop-blur-md transition-all hover:scale-105 hover:bg-white/20"
                      >
                        <Play className="mr-2 h-4 w-4 fill-current" />
                        Trailer
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <iframe
                    className="absolute inset-0 h-full w-full"
                    src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&controls=1&mute=0&rel=0&modestbranding=1&playsinline=1`}
                    title="Trailer"
                    allow="autoplay"
                    allowFullScreen
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowTrailer(false)}
                    className="bg-background/60 text-foreground hover:bg-background/80 absolute top-4 right-4 z-20"
                  >
                    <X className="h-6 w-6" />
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Main content ─────────────────────────────────────────────────── */}
        <div className="px-8 pb-24 md:px-20 lg:px-24">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[auto_1fr] lg:gap-6">
            {/* Poster column -- hidden on mobile */}
            <div className="hidden lg:block">
              <PortraitCard
                title={title}
                posterUrl={posterUrl}
                showContent={false}
                className="w-48 rounded-xl shadow-2xl lg:w-64"
              />
            </div>

            {/* Content column */}
            <div className="flex flex-col gap-5">
              {/* Title + status badge */}
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-foreground text-3xl font-black tracking-tight drop-shadow-md sm:text-4xl lg:text-5xl">
                  {title}
                </h1>
                {availability?.state && (
                  <StatusBadge
                    state={availability.state}
                    size="default"
                    className="px-3 py-1.5 text-sm font-medium"
                  />
                )}
                {availability?.downloads && availability.downloads.length > 0 && (
                  <DownloadProgress downloads={availability.downloads} />
                )}
              </div>

              {/* Consumer action buttons */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Play -- when in Jellyfin */}
                {canPlay && (
                  <Button
                    size="default"
                    onClick={handlePlay}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 px-6 font-bold"
                  >
                    <Play className="mr-1.5 h-4 w-4 fill-current" />
                    Play
                  </Button>
                )}

                {/* Watchlist -- personal bookmark, shown whenever Jellyfin knows the item */}
                {jellyfinEntry && (
                  <Button
                    variant="secondary"
                    size="default"
                    disabled={togglingFavorite}
                    onClick={handleToggleFavorite}
                    className={
                      isFavorite
                        ? "border-primary/50 text-primary hover:bg-primary/10 hover:text-primary hover:border-primary border bg-transparent px-4"
                        : "border-muted-foreground/30 text-muted-foreground hover:bg-muted hover:text-foreground border bg-transparent px-4"
                    }
                  >
                    {togglingFavorite ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Heart
                        className={`mr-1.5 h-4 w-4 ${isFavorite ? "fill-current" : ""}`}
                      />
                    )}
                    {isFavorite ? "In Watchlist" : "Watchlist"}
                  </Button>
                )}

                {/* Request — shown when item isn't already tracked or available. */}
                {!canPlay && !isTracked && (
                  mediaType === "movie" ? (
                    <Button
                      variant="secondary"
                      size="default"
                      disabled={requestingMovie}
                      onClick={handleMovieRequest}
                      className="border-primary/50 text-primary hover:bg-primary/10 hover:text-primary hover:border-primary border bg-transparent px-4"
                    >
                      {requestingMovie ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="mr-1.5 h-4 w-4" />
                      )}
                      Request
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="default"
                      disabled={requestingTvShow}
                      onClick={handleTvRequest}
                      className="border-primary/50 text-primary hover:bg-primary/10 hover:text-primary hover:border-primary border bg-transparent px-4"
                    >
                      {requestingTvShow ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="mr-1.5 h-4 w-4" />
                      )}
                      Request
                    </Button>
                  )
                )}

                {/* Request More — TV shows tracked in Seerr can request additional seasons. */}
                {isTracked && mediaType === "tv" && (
                  <Button
                    variant="secondary"
                    size="default"
                    disabled={requestingTvShow}
                    onClick={handleTvRequest}
                    className="border-primary/50 text-primary hover:bg-primary/10 hover:text-primary hover:border-primary border bg-transparent px-4"
                  >
                    {requestingTvShow ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-1.5 h-4 w-4" />
                    )}
                    Request More
                  </Button>
                )}

                {/* Report issue — visible whenever the title exists in Seerr's tracking. */}
                {availability?.seerrMediaId !== undefined && (
                  <Button
                    variant="ghost"
                    size="default"
                    onClick={() => setIssueDialogOpen(true)}
                    className="text-muted-foreground hover:text-foreground hover:bg-muted/50 px-4"
                  >
                    <MessageSquare className="mr-1.5 h-4 w-4" />
                    Report issue
                  </Button>
                )}
              </div>

              {/* Metadata line */}
              {metaItems.length > 0 && (
                <div className="text-muted-foreground flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm">
                  {metaItems.map((item, index) => (
                    <Fragment key={index}>
                      <span>{item}</span>
                      {index < metaItems.length - 1 && (
                        <span className="text-border">&bull;</span>
                      )}
                    </Fragment>
                  ))}
                </div>
              )}

              {/* Genre pills */}
              {genres.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {genres.map((genre) => (
                    <span
                      key={genre.id}
                      className="border-border bg-muted/50 text-muted-foreground rounded-xl border px-3 py-1 text-sm"
                    >
                      {genre.name}
                    </span>
                  ))}
                </div>
              )}

              {/* Ratings row */}
              {ratingsData?.scores && ratingsData.scores.length > 0 ? (
                <div className="flex items-center gap-5">
                  {ratingsData.scores.map((score) => (
                    <a
                      key={score.name}
                      href={score.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 transition-colors"
                    >
                      {score.image && (
                        <Image
                          src={`/rating-logos/${score.image}`}
                          alt={score.name}
                          width={24}
                          height={24}
                          unoptimized
                          className="h-6 w-6 object-contain"
                        />
                      )}
                      <span className="text-base font-semibold">
                        {score.score}
                      </span>
                    </a>
                  ))}
                </div>
              ) : ratingsLoading ? (
                <div className="flex gap-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-6 w-14 rounded" />
                  ))}
                </div>
              ) : null}

              {/* Overview */}
              {overview && (
                <p className="text-muted-foreground max-w-4xl text-base leading-relaxed">
                  {overview}
                </p>
              )}
            </div>
          </div>

          {/* ── Seasons carousel (TV only) ─────────────────────────────────── */}
          {mediaType === "tv" && tvDetails && tvDetails.seasons.length > 0 && (
            <section className="mt-8 md:mt-12">
              <SectionHeading title="Seasons" />
              <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-none">
                {tvDetails.seasons.map((season) => {
                  const seasonAvail = availability?.seasons?.find(
                    (s) => s.season_number === season.season_number,
                  );
                  const isSelected =
                    selectedSeasonNumber === season.season_number;

                  return (
                    <button
                      key={season.id}
                      onClick={() =>
                        setSelectedSeasonNumber(season.season_number)
                      }
                      className={`group relative shrink-0 block transition-all ${
                        isSelected ? "" : "opacity-60 hover:opacity-90"
                      }`}
                    >
                      <PortraitCard
                        title={
                          season.season_number === 0
                            ? "Specials"
                            : `Season ${season.season_number}`
                        }
                        posterUrl={tmdbPosterUrl(season.poster_path, "medium")}
                        showContent
                        topRight={
                          seasonAvail?.state ? (
                            <StatusBadge
                              state={seasonAvail.state}
                              size="default"
                            />
                          ) : undefined
                        }
                        className="w-28 md:w-32 lg:w-36"
                      />
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Episodes grid (TV only) ────────────────────────────────────── */}
          {mediaType === "tv" && (
            <section className="mt-8 md:mt-12">
              <SectionHeading
                title={`Episodes \u2014 Season ${selectedSeasonNumber}`}
              />
              {seasonEpisodesLoading ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 xl:grid-cols-3 2xl:grid-cols-4">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton
                      key={i}
                      className="aspect-video w-full rounded-xl"
                    />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 xl:grid-cols-3 2xl:grid-cols-4">
                  {seasonEpisodes.map((episode) => {
                    const inJellyfin = Boolean(
                      seasonJellyfinEpisodes[episode.episode_number],
                    );
                    return (
                      <button
                        key={episode.id}
                        className="group w-full text-left"
                        onClick={() => handleEpisodeClick(episode)}
                      >
                        <EpisodeCard
                          title={episode.name}
                          episodeNumber={episode.episode_number}
                          stillUrl={
                            episode.still_path
                              ? `https://image.tmdb.org/t/p/w780${episode.still_path}`
                              : null
                          }
                          airedDate={episode.air_date ?? undefined}
                          runtime={
                            episode.runtime
                              ? `${episode.runtime} min`
                              : undefined
                          }
                          isAvailable={inJellyfin}
                          overview={episode.overview}
                          className="h-full transition-transform duration-300 group-hover:scale-[1.01] group-hover:shadow-lg"
                        />
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* ── Cast carousel ────────────────────────────────────────────────── */}
          {castMembers.length > 0 && (
            <section className="mt-8 md:mt-12">
              <SectionHeading title="Cast" />
              <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-none">
                {castMembers.slice(0, 20).map((member) => (
                  <div
                    key={member.id}
                    className="group shrink-0 opacity-80 transition-opacity duration-300 hover:opacity-100"
                  >
                    <PortraitCard
                      title={member.name}
                      subtitle={member.character}
                      posterUrl={
                        member.profile_path
                          ? `https://image.tmdb.org/t/p/w185${member.profile_path}`
                          : null
                      }
                      className="w-32 md:w-36 lg:w-40"
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Recommendations carousel ─────────────────────────────────────── */}
          <MediaCarousel
            title="Recommendations"
            items={recommendations.map((item) => ({
              id: item.id,
              title: "title" in item ? item.title : item.name,
              posterPath: item.poster_path,
              mediaType: item.media_type ?? mediaType,
              year:
                "release_date" in item
                  ? item.release_date?.substring(0, 4)
                  : "first_air_date" in item
                    ? item.first_air_date?.substring(0, 4)
                    : null,
            }))}
          />

          {/* ── Similar carousel ─────────────────────────────────────────────── */}
          <MediaCarousel
            title="Similar"
            items={similarItems.map((item) => ({
              id: item.id,
              title: "title" in item ? item.title : item.name,
              posterPath: item.poster_path,
              mediaType: mediaType,
              year:
                "release_date" in item
                  ? item.release_date?.substring(0, 4)
                  : "first_air_date" in item
                    ? item.first_air_date?.substring(0, 4)
                    : null,
            }))}
          />
        </div>
      </div>

      {/* ── Episode detail sheet ─────────────────────────────────────────────── */}
      <EpisodeDetailSheet
        episode={selectedEpisode}
        showTitle={title}
        isOpen={isEpisodeSheetOpen}
        onClose={() => {
          setIsEpisodeSheetOpen(false);
          setSelectedEpisode(null);
          setEpisodeJellyfinId(null);
        }}
        onPlay={episodeJellyfinId ? handleEpisodePlay : undefined}
        isMobile={isMobile}
      />

      {availability?.seerrMediaId !== undefined && (
        <ReportIssueDialog
          isOpen={issueDialogOpen}
          onClose={() => setIssueDialogOpen(false)}
          mediaId={availability.seerrMediaId}
          title={title}
        />
      )}
    </div>
  );
}

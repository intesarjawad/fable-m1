"use client";

import { useEffect, useState, useCallback, Fragment } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { Play, X, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { tmdbPosterUrl, tmdbBackdropUrl } from "@/src/lib/tmdb";
import { useJellyfinTmdbMap } from "@/src/hooks/use-jellyfin-tmdb-map";
import { requestMovie } from "@/src/actions/request";

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
import { EpisodeCard } from "@/src/components/media/episode-card";
import { MediaLink } from "@/src/components/media/media-link";
import { RequestSheet } from "@/src/components/request-sheet";

import {
  fetchMovieDetails,
  fetchTvDetails,
  fetchTvSeasonDetails,
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
  type RivenMediaItem,
  type RivenEpisode,
} from "@/src/types/details";

import type { TmdbTvShow } from "@/src/types/tmdb";

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
      <h2 className="text-foreground text-xl font-bold tracking-tight drop-shadow-md">{title}</h2>
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

function MediaCarousel({ items, title }: { items: CarouselItem[]; title: string }) {
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
              subtitle={`${item.mediaType === "tv" ? "TV" : "Movie"}${item.year ? ` • ${item.year}` : ""}`}
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
  rivenEpisode: RivenEpisode | null;
  showTitle: string;
  isOpen: boolean;
  onClose: () => void;
}

function formatFileSizeGb(bytes: number): string {
  return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
}

function formatAudioChannels(channelCount: number): string {
  if (channelCount === 8) return "7.1";
  if (channelCount === 6) return "5.1";
  return `${channelCount}ch`;
}

function EpisodeDetailSheet({ episode, rivenEpisode, showTitle, isOpen, onClose }: EpisodeSheetProps) {
  if (!episode) return null;

  const videoMeta = rivenEpisode?.media_metadata?.video;
  const audioTracks = rivenEpisode?.media_metadata?.audio_tracks ?? [];
  const fileEntry = rivenEpisode?.filesystem_entry;
  const stillUrl = episode.still_path
    ? `https://image.tmdb.org/t/p/w780${episode.still_path}`
    : null;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col overflow-hidden border-l border-white/10 bg-zinc-950/95 backdrop-blur-2xl sm:max-w-xl md:max-w-2xl lg:max-w-3xl"
      >
        <SheetHeader className="px-6 pt-6 shrink-0">
          <SheetTitle className="text-2xl font-bold tracking-tight">
            S{episode.season_number}E{episode.episode_number} — {episode.name}
          </SheetTitle>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground font-serif text-sm">{showTitle}</span>
            <span className="text-muted-foreground">•</span>
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
            {rivenEpisode?.state && (
              <StatusBadge state={rivenEpisode.state} className="text-xs" />
            )}
          </div>
        </SheetHeader>

        <div className="mt-6 flex flex-1 flex-col gap-8 overflow-y-auto px-6 pb-12">
          {episode.overview && (
            <p className="text-muted-foreground text-base leading-relaxed">{episode.overview}</p>
          )}

          {stillUrl && (
            <div className="relative w-full max-w-[640px] overflow-hidden rounded-xl shadow-lg ring-1 ring-white/10">
              <Image
                src={stillUrl}
                alt={episode.name}
                width={640}
                height={360}
                className="aspect-video w-full object-cover"
                unoptimized
              />
            </div>
          )}

          {(rivenEpisode?.filesystem_entry || rivenEpisode?.media_metadata) && (
            <div className="flex flex-col gap-6">
              <SectionHeading title="File Details" />
              <div className="flex flex-col gap-4 text-sm">
                {rivenEpisode.media_metadata?.filename && (
                  <div>
                    <p className="text-primary font-mono text-xs font-semibold tracking-wider uppercase">
                      Current Filename
                    </p>
                    <p className="text-muted-foreground mt-1 font-mono text-xs break-all">
                      {rivenEpisode.media_metadata.filename}
                    </p>
                  </div>
                )}

                {videoMeta && (
                  <div className="flex flex-col gap-2">
                    <span className="text-primary font-mono text-xs font-semibold tracking-wider uppercase">
                      Video
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {videoMeta.resolution_width && videoMeta.resolution_height && (
                        <Badge variant="outline" className="font-mono text-xs">
                          {videoMeta.resolution_width}×{videoMeta.resolution_height}
                        </Badge>
                      )}
                      {videoMeta.codec && (
                        <Badge variant="outline" className="font-mono text-xs">
                          {videoMeta.codec}
                        </Badge>
                      )}
                      {videoMeta.hdr_type && (
                        <Badge variant="outline" className="font-mono text-xs">
                          {videoMeta.hdr_type}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                {audioTracks.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="text-primary font-mono text-xs font-semibold tracking-wider uppercase">
                      Audio
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {audioTracks.map((track, index) => (
                        <Badge key={index} variant="outline" className="font-mono text-xs">
                          {track.codec}
                          {track.channels ? ` ${formatAudioChannels(track.channels)}` : ""}
                          {track.language ? ` (${track.language.toUpperCase()})` : ""}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {rivenEpisode.media_metadata?.quality_source && (
                  <div className="flex flex-col gap-2">
                    <span className="text-primary font-mono text-xs font-semibold tracking-wider uppercase">
                      Source
                    </span>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="font-mono text-xs">
                        {rivenEpisode.media_metadata.quality_source}
                      </Badge>
                      {rivenEpisode.media_metadata.is_remux && (
                        <Badge variant="outline" className="font-mono text-xs">
                          REMUX
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                {fileEntry?.file_size && (
                  <div className="flex flex-col gap-2">
                    <span className="text-primary font-mono text-xs font-semibold tracking-wider uppercase">
                      Size
                    </span>
                    <span className="text-muted-foreground font-mono text-xs">
                      {formatFileSizeGb(fileEntry.file_size)}
                    </span>
                  </div>
                )}
              </div>
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
      {/* Hero skeleton */}
      <div className="px-2 md:px-4">
        <Skeleton className="h-[40vh] max-h-[600px] min-h-[350px] w-full rounded-3xl" />
      </div>
      {/* Content skeleton */}
      <div className="px-8 pb-24 md:px-20 lg:px-24 mt-6">
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
  const tmdbId = Number(params.id);
  const mediaType = params.type as "movie" | "tv";

  const { tmdbMap } = useJellyfinTmdbMap();

  // Core data
  const [movieDetails, setMovieDetails] = useState<TmdbMovieDetails | null>(null);
  const [tvDetails, setTvDetails] = useState<TmdbTvDetails | null>(null);
  const [rivenItem, setRivenItem] = useState<RivenMediaItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Season/episode state
  const [selectedSeasonNumber, setSelectedSeasonNumber] = useState<number>(1);
  const [seasonEpisodes, setSeasonEpisodes] = useState<TmdbEpisode[]>([]);
  const [seasonEpisodesLoading, setSeasonEpisodesLoading] = useState(false);

  // UI state
  const [showTrailer, setShowTrailer] = useState(false);
  const [requestingMovie, setRequestingMovie] = useState(false);
  const [showRequestSheet, setShowRequestSheet] = useState(false);

  // Episode sheet state
  const [selectedEpisode, setSelectedEpisode] = useState<TmdbEpisode | null>(null);
  const [isEpisodeSheetOpen, setIsEpisodeSheetOpen] = useState(false);

  // Ratings
  const [ratingsData, setRatingsData] = useState<RatingsResponse | null>(null);
  const [ratingsLoading, setRatingsLoading] = useState(false);

  // ─── Data loading ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!tmdbId || isNaN(tmdbId) || (mediaType !== "movie" && mediaType !== "tv")) {
      setLoadError("Invalid media ID or type.");
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();

    async function loadData() {
      setIsLoading(true);
      setLoadError(null);

      try {
        const [details, rivenResponse] = await Promise.all([
          mediaType === "movie" ? fetchMovieDetails(tmdbId) : fetchTvDetails(tmdbId),
          fetch(`/api/riven/items/${tmdbId}?media_type=${mediaType}`).then(
            (r) => (r.ok ? r.json() : null)
          ).catch(() => null),
        ]);

        if (!details) {
          setLoadError("Could not load details. Check your TMDB configuration.");
          return;
        }

        if (mediaType === "movie") {
          setMovieDetails(details as TmdbMovieDetails);
        } else {
          const tvData = details as TmdbTvDetails;
          setTvDetails(tvData);

          // Select first real season (season 1 if present, else first available)
          const firstRealSeason = tvData.seasons.find((s) => s.season_number === 1)
            ?? tvData.seasons.find((s) => s.season_number > 0)
            ?? tvData.seasons[0];

          if (firstRealSeason) {
            setSelectedSeasonNumber(firstRealSeason.season_number);
          }
        }

        if (rivenResponse?.id) {
          setRivenItem(rivenResponse as RivenMediaItem);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setLoadError(err instanceof Error ? err.message : "Failed to load details.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    loadData();
    return () => controller.abort();
  }, [tmdbId, mediaType]);

  // ─── Ratings loading ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!tmdbId || isNaN(tmdbId)) return;

    const controller = new AbortController();
    setRatingsLoading(true);

    fetch(`/api/ratings/${tmdbId}?type=${mediaType}`, { signal: controller.signal })
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
  }, [tmdbId, mediaType]);

  // ─── Season episode loading ───────────────────────────────────────────────

  useEffect(() => {
    if (mediaType !== "tv" || !tvDetails || !selectedSeasonNumber) return;

    const controller = new AbortController();
    setSeasonEpisodesLoading(true);

    fetchTvSeasonDetails(tmdbId, selectedSeasonNumber)
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
  }, [tmdbId, mediaType, tvDetails, selectedSeasonNumber]);

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
  const logoUrl = logoPath ? `https://image.tmdb.org/t/p/w300${logoPath}` : null;

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

  const originalLanguage = (movieDetails?.original_language ?? tvDetails?.original_language ?? "")
    .toUpperCase();

  const certification = movieDetails?.release_dates
    ? extractMovieCertification(movieDetails.release_dates)
    : tvDetails?.content_ratings
      ? extractTvCertification(tvDetails.content_ratings)
      : null;

  const metaItems = [releaseYear, runtimeDisplay, originalLanguage, certification].filter(Boolean);

  const castMembers = movieDetails?.credits.cast ?? tvDetails?.credits.cast ?? [];
  const recommendations = movieDetails?.recommendations.results ?? tvDetails?.recommendations.results ?? [];
  const similarItems = movieDetails?.similar.results ?? tvDetails?.similar.results ?? [];

  const jellyfinEntry = tmdbMap.get(tmdbId);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const handlePlay = useCallback(() => {
    if (!jellyfinEntry) return;
    router.push(`/player/${jellyfinEntry.jellyfinId}`);
  }, [jellyfinEntry, router]);

  const handleMovieRequest = useCallback(async () => {
    setRequestingMovie(true);
    try {
      const result = await requestMovie(tmdbId);
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
  }, [tmdbId, title]);

  const handleEpisodeClick = useCallback((episode: TmdbEpisode) => {
    setSelectedEpisode(episode);
    setIsEpisodeSheetOpen(true);
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────

  if (isLoading) return <DetailPageSkeleton />;

  if (loadError) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-8">
        <div className="text-center">
          <p className="text-muted-foreground text-lg">{loadError}</p>
          <Button variant="outline" className="mt-4" onClick={() => router.back()}>
            Go back
          </Button>
        </div>
      </div>
    );
  }

  // Build TV show stub for RequestSheet (which needs a TmdbTvShow shape)
  const tvShowForRequest: TmdbTvShow | null =
    tvDetails
      ? {
          id: tvDetails.id,
          name: tvDetails.name,
          original_name: tvDetails.original_name,
          overview: tvDetails.overview,
          poster_path: tvDetails.poster_path,
          backdrop_path: tvDetails.backdrop_path,
          first_air_date: tvDetails.first_air_date,
          vote_average: tvDetails.vote_average,
          vote_count: tvDetails.vote_count,
          genre_ids: tvDetails.genres.map((g) => g.id),
          popularity: 0,
          adult: false,
          original_language: tvDetails.original_language,
          origin_country: [],
          media_type: "tv",
        }
      : null;

  // Find riven season/episode data
  const selectedRivenSeason = rivenItem?.seasons?.find(
    (s) => s.season_number === selectedSeasonNumber
  ) ?? null;

  const episodeSheetRivenEpisode = selectedEpisode
    ? selectedRivenSeason?.episodes?.find(
        (e) => e.episode_number === selectedEpisode.episode_number
      ) ?? null
    : null;

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden">
      {/* Fixed blurred backdrop */}
      {backdropUrl && (
        <div className="fixed top-0 left-0 z-0 h-screen w-full pointer-events-none">
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
                  ? { backgroundImage: `url('${backdropUrl}')`, padding: "1.5rem" }
                  : { backgroundImage: `url('${backdropUrl}')` }
              }
            >
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
              {/* Border overlay to prevent bright edge glitch */}
              <div className="border-border/10 pointer-events-none absolute inset-0 rounded-3xl border" />

              {!showTrailer ? (
                <div className="relative z-10 flex w-full items-end justify-between md:p-6">
                  {/* Logo or spacer */}
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

                  {/* Action buttons */}
                  <div className="flex gap-2 md:gap-4">
                    {jellyfinEntry && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handlePlay}
                        className="border border-white/10 bg-white/10 px-6 text-sm font-bold text-white shadow-lg backdrop-blur-md transition-all hover:scale-105 hover:bg-white/20"
                      >
                        <Play className="mr-2 h-4 w-4 fill-current" />
                        Play
                      </Button>
                    )}
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
            {/* Poster column — hidden on mobile */}
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
                {rivenItem?.state && (
                  <StatusBadge
                    state={rivenItem.state}
                    size="default"
                    className="px-3 py-1.5 text-sm font-medium"
                  />
                )}
              </div>

              {/* Request button (only when not in Riven) */}
              {!rivenItem && (
                <div className="flex flex-wrap items-center gap-2">
                  {mediaType === "movie" ? (
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
                  ) : tvShowForRequest ? (
                    <>
                      <Button
                        variant="secondary"
                        size="default"
                        onClick={() => setShowRequestSheet(true)}
                        className="border-primary/50 text-primary hover:bg-primary/10 hover:text-primary hover:border-primary border bg-transparent px-4"
                      >
                        <Download className="mr-1.5 h-4 w-4" />
                        Request
                      </Button>
                      <RequestSheet
                        item={tvShowForRequest}
                        isOpen={showRequestSheet}
                        onClose={() => setShowRequestSheet(false)}
                        onRequestSubmitted={() => setShowRequestSheet(false)}
                      />
                    </>
                  ) : null}
                </div>
              )}

              {/* Metadata line */}
              {metaItems.length > 0 && (
                <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  {metaItems.map((item, index) => (
                    <Fragment key={index}>
                      <span>{item}</span>
                      {index < metaItems.length - 1 && (
                        <span className="text-border">•</span>
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
                      <span className="text-base font-semibold">{score.score}</span>
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
                  const rivenSeason = rivenItem?.seasons?.find(
                    (s) => s.season_number === season.season_number
                  );
                  const isSelected = selectedSeasonNumber === season.season_number;

                  return (
                    <button
                      key={season.id}
                      onClick={() => setSelectedSeasonNumber(season.season_number)}
                      className={`group relative shrink-0 block transition-all ${
                        isSelected ? "" : "opacity-60 hover:opacity-90"
                      }`}
                    >
                      <PortraitCard
                        title={season.season_number === 0 ? "Specials" : `Season ${season.season_number}`}
                        posterUrl={tmdbPosterUrl(season.poster_path, "medium")}
                        showContent
                        topRight={
                          rivenSeason?.state ? (
                            <StatusBadge state={rivenSeason.state} size="default" />
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
                title={`Episodes — Season ${selectedSeasonNumber}`}
              />
              {seasonEpisodesLoading ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 xl:grid-cols-3 2xl:grid-cols-4">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="aspect-video w-full rounded-xl" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 xl:grid-cols-3 2xl:grid-cols-4">
                  {seasonEpisodes.map((episode) => {
                    const rivenEpisode =
                      selectedRivenSeason?.episodes?.find(
                        (e) => e.episode_number === episode.episode_number
                      ) ?? null;

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
                          runtime={episode.runtime ? `${episode.runtime} min` : undefined}
                          state={rivenEpisode?.state}
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
        rivenEpisode={episodeSheetRivenEpisode}
        showTitle={title}
        isOpen={isEpisodeSheetOpen}
        onClose={() => {
          setIsEpisodeSheetOpen(false);
          setSelectedEpisode(null);
        }}
      />
    </div>
  );
}

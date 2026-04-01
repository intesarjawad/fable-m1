"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { AnimatePresence, motion } from "framer-motion";
import { Play, Info, Star, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { cn } from "@/src/lib/utils";
import { tmdbBackdropUrl } from "@/src/lib/tmdb";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";

interface RatingScore {
  name: string;
  image: string;
  score: number | string;
  url: string;
}

// ─── Genre map (TMDB IDs → display names) ────────────────────────────────────
const TMDB_GENRE_NAMES: Record<number, string> = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Science Fiction",
  10770: "TV Movie",
  53: "Thriller",
  10752: "War",
  37: "Western",
  10759: "Action & Adventure",
  10762: "Kids",
  10763: "News",
  10764: "Reality",
  10765: "Sci-Fi & Fantasy",
  10766: "Soap",
  10767: "Talk",
  10768: "War & Politics",
};

// Limit genres shown on the hero card
const MAX_VISIBLE_GENRES = 4;

// ─── Types ────────────────────────────────────────────────────────────────────
export interface HeroCarouselItem {
  id: number;
  title?: string;
  name?: string;
  overview?: string;
  backdrop_path?: string | null;
  media_type?: "movie" | "tv" | "person" | "company";
  vote_average?: number | null;
  genre_ids?: number[];
  release_date?: string;
  first_air_date?: string;
  original_language?: string;
  certification?: string;
}

interface SlideLogoData {
  logoUrl: string | null;
  certification: string | null;
  ratings: RatingScore[] | null;
}

interface HeroCarouselProps {
  items: HeroCarouselItem[];
  className?: string;
}

// ─── Slide content (animated on each index change) ───────────────────────────
interface SlideContentProps {
  item: HeroCarouselItem;
  logoData: SlideLogoData | undefined;
}

function extractYear(dateString?: string): string {
  if (!dateString) return "";
  return dateString.slice(0, 4);
}

function SlideContent({ item, logoData }: SlideContentProps) {
  const isTV = item.media_type === "tv";
  const mediaType = isTV ? "tv" : "movie";
  const displayTitle = item.title ?? item.name ?? "Untitled";
  const releaseYear = extractYear(item.release_date ?? item.first_air_date);
  const visibleGenres = (item.genre_ids ?? [])
    .slice(0, MAX_VISIBLE_GENRES)
    .filter((genreId) => TMDB_GENRE_NAMES[genreId]);

  const certificationText =
    logoData?.certification ||
    (item.certification && item.certification !== "N/A"
      ? item.certification
      : null);

  const contentVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (delay: number) => ({
      opacity: 1,
      y: 0,
      transition: { duration: 0.6, delay, ease: [0.33, 1, 0.68, 1] as [number, number, number, number] },
    }),
  };

  return (
    <div className="absolute inset-0 z-10 flex flex-col justify-end px-8 pb-24 pt-2 md:px-32 md:pb-16 md:pt-8">
      <div className="flex w-full max-w-3xl flex-col items-start">
        {/* Logo or title */}
        <motion.div
          className="mb-4 flex h-24 items-end"
          custom={0.1}
          variants={contentVariants}
          initial="hidden"
          animate="visible"
        >
          {logoData?.logoUrl ? (
            <img
              src={logoData.logoUrl}
              alt={displayTitle}
              className="max-h-full max-w-[80%] object-contain object-left-bottom drop-shadow-2xl"
            />
          ) : (
            <h1 className="line-clamp-2 text-3xl font-black tracking-tighter drop-shadow-2xl md:text-5xl md:leading-[1.1] lg:text-6xl">
              {displayTitle}
            </h1>
          )}
        </motion.div>

        {/* Metadata row */}
        <motion.div
          className="mt-2 flex flex-wrap items-center gap-4 text-xs font-medium text-white md:mt-4 md:text-sm"
          custom={0.2}
          variants={contentVariants}
          initial="hidden"
          animate="visible"
        >
          <span className="flex items-center justify-center rounded-md border border-white/20 bg-white/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider leading-none backdrop-blur-md md:text-xs">
            {isTV ? "Series" : "Movie"}
          </span>

          {certificationText && (
            <>
              <span className="text-white/40">|</span>
              <span className="flex items-center justify-center rounded-sm border border-white/40 px-1.5 py-1 text-[10px] font-bold uppercase tracking-wider leading-none md:text-xs">
                {certificationText}
              </span>
            </>
          )}

          {releaseYear && (
            <>
              <span className="text-white/40">|</span>
              <span className="text-white drop-shadow-md">{releaseYear}</span>
            </>
          )}

          {item.original_language && (
            <>
              <span className="text-white/40">|</span>
              <span className="uppercase text-white drop-shadow-md">
                {item.original_language}
              </span>
            </>
          )}

          {logoData?.ratings && logoData.ratings.length > 0 ? (
            <div className="ml-2 flex items-center gap-4">
              {logoData.ratings.map((score) => (
                <a
                  key={score.name}
                  href={score.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 transition-opacity hover:opacity-80"
                  title={score.name}
                >
                  <Image
                    src={`/rating-logos/${score.image}`}
                    alt={score.name}
                    width={16}
                    height={16}
                    className="h-4 w-auto object-contain"
                    unoptimized
                  />
                  <span className="text-xs font-bold text-white drop-shadow-md">
                    {score.score}
                  </span>
                </a>
              ))}
            </div>
          ) : item.vote_average != null && item.vote_average > 0 ? (
            <>
              <span className="text-white/40">|</span>
              <span className="flex items-center font-bold text-white drop-shadow-md">
                <Star className="mr-1 h-3.5 w-3.5 fill-current text-yellow-500" />
                {item.vote_average.toFixed(1)}
              </span>
            </>
          ) : null}
        </motion.div>

        {/* Overview */}
        {item.overview && (
          <motion.p
            className="mt-3 line-clamp-2 max-w-xl text-xs leading-relaxed text-white/90 drop-shadow-md md:mt-4 md:text-base"
            custom={0.3}
            variants={contentVariants}
            initial="hidden"
            animate="visible"
          >
            {item.overview}
          </motion.p>
        )}

        {/* Genre pills */}
        {visibleGenres.length > 0 && (
          <motion.div
            className="mt-4 flex flex-wrap gap-2 md:mt-6"
            custom={0.4}
            variants={contentVariants}
            initial="hidden"
            animate="visible"
          >
            {visibleGenres.map((genreId) => (
              <span
                key={genreId}
                className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-white backdrop-blur-md transition-colors hover:bg-white/20"
              >
                {TMDB_GENRE_NAMES[genreId]}
              </span>
            ))}
          </motion.div>
        )}

        {/* Action buttons */}
        <motion.div
          className="mt-6 flex flex-wrap gap-4 md:mt-8"
          custom={0.5}
          variants={contentVariants}
          initial="hidden"
          animate="visible"
        >
          <Link href={`/details/${item.id}/${mediaType}`}>
            <Button
              size="lg"
              className="bg-primary text-primary-foreground hover:bg-primary/90 flex h-10 items-center justify-center rounded-md px-8 text-sm font-bold shadow-sm transition-all hover:scale-[1.02] md:h-12 md:text-base"
            >
              <Play className="mr-2 h-4 w-4" />
              Play Now
            </Button>
          </Link>
          <Link href={`/details/${item.id}/${mediaType}`}>
            <Button
              variant="secondary"
              size="lg"
              className="flex h-10 items-center justify-center rounded-md border border-white/10 bg-white/10 px-8 text-sm font-bold text-white shadow-sm backdrop-blur-md transition-all hover:scale-[1.02] hover:bg-white/20 md:h-12 md:text-base"
            >
              <Info className="mr-2 h-4 w-4" />
              More Info
            </Button>
          </Link>
        </motion.div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function HeroCarousel({ items, className }: HeroCarouselProps) {
  const autoplayPlugin = useRef(
    Autoplay({ delay: 5000, stopOnInteraction: false })
  );

  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true }, [
    autoplayPlugin.current,
  ]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [logoDataMap, setLogoDataMap] = useState<Record<number, SlideLogoData>>({});
  // Tracks which item IDs have been fetched (or are in-flight) so we never duplicate requests
  const fetchedItemIds = useRef(new Set<number>());

  // Track index changes
  useEffect(() => {
    if (!emblaApi) return;

    const onSelect = () => setCurrentIndex(emblaApi.selectedScrollSnap());
    emblaApi.on("select", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi]);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  const fetchLogoData = useCallback(async (item: HeroCarouselItem) => {
    // Guard using a ref so this check never sees stale state
    if (fetchedItemIds.current.has(item.id)) return;
    fetchedItemIds.current.add(item.id);

    const mediaType = item.media_type === "tv" ? "tv" : "movie";

    const [logoResponse, ratingsResponse] = await Promise.allSettled([
      fetch(`/api/tmdb/logo/${mediaType}/${item.id}`),
      fetch(`/api/ratings/${item.id}?type=${mediaType}`),
    ]);

    const logoData =
      logoResponse.status === "fulfilled" && logoResponse.value.ok
        ? await logoResponse.value.json().catch(() => ({}))
        : {};

    const ratingsData =
      ratingsResponse.status === "fulfilled" && ratingsResponse.value.ok
        ? await ratingsResponse.value.json().catch(() => ({ scores: null }))
        : { scores: null };

    setLogoDataMap((prev) => ({
      ...prev,
      [item.id]: {
        logoUrl: logoData.logoUrl ?? null,
        certification: logoData.certification ?? null,
        ratings: ratingsData.scores ?? null,
      },
    }));
  }, []);

  // Prefetch current, next, and previous slides eagerly; rest deferred
  useEffect(() => {
    if (!items || items.length === 0) return;

    const totalItems = items.length;
    const nextIndex = (currentIndex + 1) % totalItems;
    const prevIndex = (currentIndex - 1 + totalItems) % totalItems;

    fetchLogoData(items[currentIndex]);
    fetchLogoData(items[nextIndex]);
    fetchLogoData(items[prevIndex]);

    const deferTimer = setTimeout(() => {
      items.forEach((item, index) => {
        if (index !== currentIndex && index !== nextIndex && index !== prevIndex) {
          fetchLogoData(item);
        }
      });
    }, 1000);

    return () => clearTimeout(deferTimer);
  }, [currentIndex, items, fetchLogoData]);

  if (!items || items.length === 0) {
    return <HeroCarouselSkeleton />;
  }

  return (
    <div className={cn("border-border/50 relative overflow-hidden rounded-2xl border shadow-2xl", className)}>
      {/* Embla viewport */}
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex">
          {items.map((item, slideIndex) => {
            const displayTitle = item.title ?? item.name ?? "Untitled";
            const backdropUrl = item.backdrop_path?.startsWith("http")
              ? item.backdrop_path
              : tmdbBackdropUrl(item.backdrop_path ?? null, "original");

            return (
              <div
                key={item.id}
                className="relative w-full flex-[0_0_100%] min-w-0 h-[50vh] min-h-[500px] max-h-[800px]"
              >
                {/* Backdrop image */}
                {backdropUrl && (
                  <img
                    src={backdropUrl}
                    alt={displayTitle}
                    className="h-full w-full select-none object-cover object-top"
                    loading="lazy"
                  />
                )}

                {/* Dramatic gradient mask — left-bottom emphasis */}
                <div
                  className="bg-background pointer-events-none absolute inset-0"
                  style={{
                    WebkitMaskImage:
                      "radial-gradient(120% 160% at 0% 100%, black 0%, transparent 70%), linear-gradient(to bottom, transparent 10%, black 100%)",
                    maskImage:
                      "radial-gradient(120% 160% at 0% 100%, black 0%, transparent 70%), linear-gradient(to bottom, transparent 10%, black 100%)",
                  }}
                />

                {/* Slide content — re-animates when this slide becomes active */}
                <AnimatePresence mode="wait">
                  {currentIndex === slideIndex && (
                    <motion.div
                      key={`content-${item.id}-${currentIndex}`}
                      className="absolute inset-0"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <SlideContent
                        item={item}
                        logoData={logoDataMap[item.id]}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>

      {/* Navigation arrows — desktop only */}
      <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-between px-4">
        <button
          onClick={scrollPrev}
          className="pointer-events-auto hidden h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-black/20 text-white/70 backdrop-blur-md transition-all hover:scale-110 hover:bg-black/40 hover:text-white md:flex"
          aria-label="Previous slide"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <button
          onClick={scrollNext}
          className="pointer-events-auto hidden h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-black/20 text-white/70 backdrop-blur-md transition-all hover:scale-110 hover:bg-black/40 hover:text-white md:flex"
          aria-label="Next slide"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      </div>

      {/* Progress indicators */}
      <div className="absolute bottom-4 left-1/2 z-20 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-4 rounded-full border border-white/10 bg-black/30 px-4 py-2 backdrop-blur-xl md:px-6 md:py-2.5">
        <span className="whitespace-nowrap font-mono text-xs font-medium text-white/90">
          {currentIndex + 1} / {items.length}
        </span>

        {/* Segmented dots — desktop */}
        <div className="hidden gap-1.5 lg:flex">
          {items.map((_, slideIndex) => (
            <button
              key={slideIndex}
              onClick={() => emblaApi?.scrollTo(slideIndex)}
              aria-label={`Go to slide ${slideIndex + 1}`}
              className="relative h-1 w-6 cursor-pointer overflow-hidden rounded-full bg-white/20 transition-all duration-300 hover:bg-white/40"
            >
              {slideIndex === currentIndex && (
                <motion.div
                  key={`progress-${slideIndex}-${currentIndex}`}
                  className="bg-primary absolute inset-y-0 left-0"
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 5, ease: "linear" }}
                />
              )}
            </button>
          ))}
        </div>

        {/* Simple progress bar — mobile / tablet */}
        <div className="h-1 w-32 overflow-hidden rounded-full bg-white/20 lg:hidden">
          <div
            className="bg-primary h-full transition-all duration-300 ease-out"
            style={{ width: `${((currentIndex + 1) / items.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────
function HeroCarouselSkeleton() {
  return (
    <div className="relative w-full overflow-hidden rounded-2xl h-[50vh] min-h-[500px] max-h-[800px]">
      <div className="from-background to-muted absolute inset-0 animate-pulse bg-gradient-to-t" />
      <div className="absolute inset-0 z-10 flex flex-col justify-end p-8 md:p-12">
        <div className="w-full max-w-xl">
          <Skeleton className="mb-3 h-12 w-3/4" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-12" />
          </div>
          <Skeleton className="mt-4 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-4/5" />
          <div className="mt-4 flex gap-2">
            <Skeleton className="h-7 w-20 rounded-full" />
            <Skeleton className="h-7 w-24 rounded-full" />
          </div>
          <div className="mt-6 flex gap-3">
            <Skeleton className="h-11 w-28" />
            <Skeleton className="h-11 w-32" />
          </div>
        </div>
      </div>
    </div>
  );
}

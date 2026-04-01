"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { MediaCarousel, MediaCarouselSlide } from "@/src/components/media/media-carousel";
import { PortraitCard, PortraitCardSkeleton } from "@/src/components/media/portrait-card";
import { MediaLink } from "@/src/components/media/media-link";
import { tmdbPosterUrl } from "@/src/lib/tmdb";
import type { TmdbMovie, TmdbTvShow } from "@/src/types/tmdb";
import { isTmdbMovie, getTmdbYear } from "@/src/types/tmdb";

interface LazyRowProps {
  title: string;
  cacheKey: string;
  fetchData: () => Promise<(TmdbMovie | TmdbTvShow)[]>;
  rightContent?: ReactNode;
}

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="bg-primary h-6 w-1 rounded-full shadow-[0_0_10px_rgba(var(--primary-raw,139,92,246),0.5)]" />
      <h2 className="text-foreground text-2xl font-bold tracking-tight drop-shadow-md">
        {children}
      </h2>
    </div>
  );
}

// sessionStorage cache helpers
const CACHE_TTL_MS = 5 * 60 * 1000;

function readFromCache<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts: number; data: T };
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeToCache<T>(key: string, data: T): void {
  try {
    sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch {}
}

export function LazyRow({ title, cacheKey, fetchData, rightContent }: LazyRowProps) {
  const [items, setItems] = useState<(TmdbMovie | TmdbTvShow)[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [visible, setVisible] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Intersection Observer — trigger fetch when row scrolls into view
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // Fetch data when visible
  useEffect(() => {
    if (!visible) return;

    const cached = readFromCache<(TmdbMovie | TmdbTvShow)[]>(cacheKey);
    if (cached) {
      setItems(cached);
      setLoaded(true);
      return;
    }

    fetchData()
      .then((results) => {
        const sliced = results.slice(0, 20);
        setItems(sliced);
        writeToCache(cacheKey, sliced);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [visible, cacheKey, fetchData]);

  // Don't render empty rows after loading
  if (loaded && items.length === 0) return null;

  return (
    <section ref={sentinelRef} className="flex flex-col gap-4">
      <div className="mb-1 flex items-center justify-between">
        <SectionHeading>{title}</SectionHeading>
        {rightContent}
      </div>
      <MediaCarousel>
        {!loaded
          ? Array.from({ length: 8 }).map((_, i) => (
              <MediaCarouselSlide key={i}>
                <PortraitCardSkeleton className="w-36" />
              </MediaCarouselSlide>
            ))
          : items.map((item) => {
              const isMovie = isTmdbMovie(item);
              const itemTitle = isMovie ? item.title : item.name;
              const mediaType = isMovie ? "movie" : "tv";
              const label = isMovie ? "Movie" : "TV";
              const year = getTmdbYear(item);
              return (
                <MediaCarouselSlide key={`${mediaType}-${item.id}`}>
                  <MediaLink id={item.id} mediaType={mediaType}>
                    <PortraitCard
                      title={itemTitle}
                      subtitle={year ? `${label} \u2022 ${year}` : label}
                      posterUrl={tmdbPosterUrl(item.poster_path, "medium")}
                      className="w-36"
                    />
                  </MediaLink>
                </MediaCarouselSlide>
              );
            })}
      </MediaCarousel>
    </section>
  );
}

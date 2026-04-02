"use client";

import { useEffect } from "react";
import { useAtom } from "jotai";
import { jellyfinTmdbMapAtom, jellyfinTmdbMapLoadedAtom } from "@/src/lib/atoms";
import { fetchAllLibraryTmdbIds } from "@/src/actions/media";
import { atom } from "jotai";

// TVDB map atom — separate from the TMDB one so existing consumers aren't affected
export const jellyfinTvdbMapAtom = atom(
  new Map<number, { jellyfinId: string; type: string }>(),
);

export function useJellyfinTmdbMap() {
  const [tmdbMap, setTmdbMap] = useAtom(jellyfinTmdbMapAtom);
  const [tvdbMap, setTvdbMap] = useAtom(jellyfinTvdbMapAtom);
  const [loaded, setLoaded] = useAtom(jellyfinTmdbMapLoadedAtom);

  useEffect(() => {
    if (loaded) return;

    async function buildMap() {
      try {
        const entries = await fetchAllLibraryTmdbIds();
        const tmdb = new Map<number, { jellyfinId: string; type: string }>();
        const tvdb = new Map<number, { jellyfinId: string; type: string }>();

        for (const entry of entries) {
          if (entry.tmdbId) {
            tmdb.set(entry.tmdbId, { jellyfinId: entry.jellyfinId, type: entry.type });
          }
          if (entry.tvdbId) {
            tvdb.set(entry.tvdbId, { jellyfinId: entry.jellyfinId, type: entry.type });
          }
        }

        setTmdbMap(tmdb);
        setTvdbMap(tvdb);
        setLoaded(true);
      } catch (error) {
        console.error("Failed to build Jellyfin ID map:", error);
      }
    }

    buildMap();
  }, [loaded, setTmdbMap, setTvdbMap, setLoaded]);

  return { tmdbMap, tvdbMap, loaded };
}

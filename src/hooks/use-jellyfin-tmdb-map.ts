"use client";

import { useEffect } from "react";
import { useAtom } from "jotai";
import { jellyfinTmdbMapAtom, jellyfinTmdbMapLoadedAtom } from "@/src/lib/atoms";
import { fetchAllLibraryTmdbIds } from "@/src/actions/media";

export function useJellyfinTmdbMap() {
  const [tmdbMap, setTmdbMap] = useAtom(jellyfinTmdbMapAtom);
  const [loaded, setLoaded] = useAtom(jellyfinTmdbMapLoadedAtom);

  useEffect(() => {
    if (loaded) return;

    async function buildMap() {
      try {
        const entries = await fetchAllLibraryTmdbIds();
        const map = new Map<number, { jellyfinId: string; type: string }>();
        for (const entry of entries) {
          if (entry.tmdbId) {
            map.set(entry.tmdbId, { jellyfinId: entry.jellyfinId, type: entry.type });
          }
        }
        setTmdbMap(map);
        setLoaded(true);
      } catch (error) {
        console.error("Failed to build TMDB map:", error);
      }
    }

    buildMap();
  }, [loaded, setTmdbMap, setLoaded]);

  return { tmdbMap, loaded };
}

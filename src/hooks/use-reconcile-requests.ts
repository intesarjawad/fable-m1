"use client";

import { useEffect, useRef } from "react";
import { useRequestState } from "./use-request-state";
import { useJellyfinTmdbMap } from "./use-jellyfin-tmdb-map";
import { useRiven } from "@/src/contexts/riven-context";
import { rivenStateToRequestStatus } from "@/src/lib/tmdb";

export function useReconcileRequests() {
  const { requests, updateRequestStatus, removeRequest } = useRequestState();
  const { tmdbMap, loaded: mapLoaded } = useJellyfinTmdbMap();
  const { isConnected } = useRiven();
  const reconciledRef = useRef(false);

  useEffect(() => {
    // Only reconcile once per session, after the TMDB map is loaded
    if (reconciledRef.current || !mapLoaded) return;
    reconciledRef.current = true;

    const activeRequests = requests.filter(
      (r) => r.status !== "ready" && r.status !== "failed"
    );

    if (activeRequests.length === 0) return;

    async function reconcile() {
      for (const request of activeRequests) {
        // Check if item is now in Jellyfin
        if (tmdbMap.has(request.tmdbId)) {
          updateRequestStatus(request.tmdbId, "ready");
          continue;
        }

        // Check Riven for current state (only if connected)
        if (isConnected) {
          try {
            const response = await fetch(
              `/api/riven/items?search=tmdb_${request.tmdbId}&limit=1`
            );
            if (response.ok) {
              const data = await response.json();
              if (data.items && data.items.length > 0) {
                const rivenItem = data.items[0];
                const newStatus = rivenStateToRequestStatus(rivenItem.state);
                if (newStatus !== request.status) {
                  updateRequestStatus(request.tmdbId, newStatus, rivenItem.id);
                }
              }
              // If Riven doesn't know about it either, leave status as-is
            }
          } catch {
            // Network error — skip reconciliation for this item
          }
        }
      }
    }

    reconcile();
  }, [mapLoaded, isConnected, requests, tmdbMap, updateRequestStatus, removeRequest]);
}

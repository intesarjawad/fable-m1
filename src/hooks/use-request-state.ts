"use client";

import { useState, useCallback, useEffect } from "react";
import type { TrackedRequest, RequestStatus } from "@/src/types/tmdb";

const STORAGE_KEY = "fable-requests";

function loadRequests(): TrackedRequest[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRequests(requests: TrackedRequest[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(requests));
}

export function useRequestState() {
  const [requests, setRequests] = useState<TrackedRequest[]>(() => loadRequests());

  // Sync to localStorage on change
  useEffect(() => {
    saveRequests(requests);
  }, [requests]);

  const addRequest = useCallback((request: TrackedRequest) => {
    setRequests((prev) => {
      // Deduplicate by tmdbId + mediaType
      const filtered = prev.filter(
        (r) => !(r.tmdbId === request.tmdbId && r.mediaType === request.mediaType)
      );
      return [request, ...filtered];
    });
  }, []);

  const updateRequestStatus = useCallback(
    (tmdbId: number, status: RequestStatus) => {
      setRequests((prev) =>
        prev.map((r) => (r.tmdbId === tmdbId ? { ...r, status } : r))
      );
    },
    []
  );

  const removeRequest = useCallback((tmdbId: number) => {
    setRequests((prev) => prev.filter((r) => r.tmdbId !== tmdbId));
  }, []);

  const getRequestByTmdbId = useCallback(
    (tmdbId: number): TrackedRequest | undefined => {
      return requests.find((r) => r.tmdbId === tmdbId);
    },
    [requests]
  );

  const activeRequests = requests.filter(
    (r) => r.status !== "ready" && r.status !== "failed"
  );

  // Clean up "ready" requests older than 24 hours
  useEffect(() => {
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    setRequests((prev) => {
      const cleaned = prev.filter(
        (r) =>
          r.status !== "ready" ||
          new Date(r.requestedAt).getTime() > dayAgo
      );
      // Only update if something was actually removed
      return cleaned.length === prev.length ? prev : cleaned;
    });
  }, []);

  return {
    requests,
    activeRequests,
    addRequest,
    updateRequestStatus,
    removeRequest,
    getRequestByTmdbId,
  };
}

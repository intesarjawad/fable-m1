"use server";

import { resolveRivenConfig } from "./riven";
import { fetchTvExternalIds } from "./tmdb";

interface RequestResult {
  success: boolean;
  message: string;
  tvdbId?: number;
}

export async function requestMovie(tmdbId: number): Promise<RequestResult> {
  const config = await resolveRivenConfig();
  if (!config) return { success: false, message: "Riven is not configured" };

  try {
    const response = await fetch(
      `${config.apiUrl.replace(/\/+$/, "")}/api/v1/items/add`,
      {
        method: "POST",
        headers: {
          "x-api-key": config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          media_type: "movie",
          tmdb_ids: [String(tmdbId)],
        }),
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return { success: false, message: data.message || `Riven returned ${response.status}` };
    }

    return { success: true, message: "Movie requested" };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Request failed" };
  }
}

export async function requestTvShow(tmdbId: number): Promise<RequestResult> {
  const config = await resolveRivenConfig();
  if (!config) return { success: false, message: "Riven is not configured" };

  // Convert TMDB ID to TVDB ID (Riven requires TVDB for TV shows)
  const externalIds = await fetchTvExternalIds(tmdbId);
  if (!externalIds?.tvdb_id) {
    return { success: false, message: "Could not find TVDB ID for this show" };
  }

  try {
    const response = await fetch(
      `${config.apiUrl.replace(/\/+$/, "")}/api/v1/items/add`,
      {
        method: "POST",
        headers: {
          "x-api-key": config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          media_type: "tv",
          tvdb_ids: [String(externalIds.tvdb_id)],
        }),
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return { success: false, message: data.message || `Riven returned ${response.status}` };
    }

    return { success: true, message: "TV show requested", tvdbId: externalIds.tvdb_id };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Request failed" };
  }
}

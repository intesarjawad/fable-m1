"use server";

import {
  getSeerrConfig as getStoredSeerrConfig,
  setSeerrConfig as storeSeerrConfig,
  removeSeerrConfig as clearStoredSeerrConfig,
  type SeerrConfig,
} from "./store/server-actions";

export interface SeerrMediaInfo {
  id?: number;
  status: number;
  status4k?: number;
  jellyfinMediaId?: string | null;
  requests?: SeerrRequestSummary[];
  downloadStatus?: SeerrDownloadStatus[];
}

export interface SeerrRequestSummary {
  id: number;
  status: number;
  is4k: boolean;
  createdAt?: string;
  requestedBy?: { id: number; displayName?: string };
}

export interface SeerrDownloadStatus {
  title?: string;
  size?: number;
  sizeLeft?: number;
  estimatedCompletionTime?: string | null;
  status?: string;
}

export interface SeerrSeasonInfo {
  id: number;
  seasonNumber: number;
  status: number;
  status4k?: number;
}

export async function resolveSeerrConfig(): Promise<SeerrConfig | null> {
  const stored = await getStoredSeerrConfig();
  if (stored?.apiUrl && stored?.apiKey) {
    return { apiUrl: stored.apiUrl.replace(/\/+$/, ""), apiKey: stored.apiKey };
  }

  const envUrl = process.env.SEERR_API_URL;
  const envKey = process.env.SEERR_API_KEY;
  if (envUrl && envKey) {
    return { apiUrl: envUrl.replace(/\/+$/, ""), apiKey: envKey };
  }

  return null;
}

export async function saveSeerrConfig(config: SeerrConfig) {
  return storeSeerrConfig(config);
}

export async function disconnectSeerr() {
  return clearStoredSeerrConfig();
}

export async function testSeerrConnection(
  config?: SeerrConfig,
): Promise<{ success: boolean; message: string }> {
  const resolved = config
    ? { apiUrl: config.apiUrl.replace(/\/+$/, ""), apiKey: config.apiKey }
    : await resolveSeerrConfig();

  if (!resolved) {
    return { success: false, message: "No Seerr configuration found" };
  }

  try {
    const response = await fetch(`${resolved.apiUrl}/status`, {
      method: "GET",
      headers: {
        "X-Api-Key": resolved.apiKey,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) return { success: true, message: "Connected to Seerr" };
    return {
      success: false,
      message: `Seerr returned ${response.status}: ${response.statusText}`,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Network error",
    };
  }
}

async function seerrGet<T>(path: string): Promise<T | null> {
  const config = await resolveSeerrConfig();
  if (!config) return null;
  try {
    const response = await fetch(`${config.apiUrl}${path}`, {
      method: "GET",
      headers: {
        "X-Api-Key": config.apiKey,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchSeerrMovieInfo(
  tmdbId: number,
): Promise<SeerrMediaInfo | null> {
  const data = await seerrGet<{ mediaInfo: SeerrMediaInfo | null }>(
    `/movie/${tmdbId}`,
  );
  return data?.mediaInfo ?? null;
}

export async function fetchSeerrTvInfo(
  tmdbId: number,
): Promise<{
  mediaInfo: SeerrMediaInfo | null;
  seasons: SeerrSeasonInfo[];
} | null> {
  const data = await seerrGet<{
    mediaInfo: (SeerrMediaInfo & { seasons?: SeerrSeasonInfo[] }) | null;
  }>(`/tv/${tmdbId}`);
  if (!data) return null;
  const seasons = data.mediaInfo?.seasons ?? [];
  return { mediaInfo: data.mediaInfo, seasons };
}

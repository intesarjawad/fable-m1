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

export interface SeerrRequestCount {
  total: number;
  movie: number;
  tv: number;
  pending: number;
  approved: number;
  declined: number;
  processing: number;
  available: number;
}

export async function fetchSeerrRequestCount(): Promise<SeerrRequestCount | null> {
  return seerrGet<SeerrRequestCount>("/request/count");
}

export interface SeerrRequestListItem {
  id: number;
  status: number;
  createdAt: string;
  updatedAt: string;
  type: "movie" | "tv";
  is4k: boolean;
  media: {
    id: number;
    tmdbId: number;
    tvdbId?: number;
    mediaType: "movie" | "tv";
    status: number;
    downloadStatus?: SeerrDownloadStatus[];
  };
  requestedBy?: { id: number; displayName?: string };
  seasons?: { seasonNumber: number; status: number }[];
}

export interface SeerrRequestList {
  pageInfo: { pages: number; pageSize: number; results: number; page: number };
  results: SeerrRequestListItem[];
}

export async function fetchSeerrRequests(params: {
  filter?: "all" | "available" | "pending" | "approved" | "processing" | "unavailable";
  sort?: "added" | "modified" | "mediaAdded";
  take?: number;
  skip?: number;
} = {}): Promise<SeerrRequestList | null> {
  const search = new URLSearchParams();
  search.set("take", String(params.take ?? 20));
  search.set("skip", String(params.skip ?? 0));
  search.set("filter", params.filter ?? "all");
  search.set("sort", params.sort ?? "added");
  return seerrGet<SeerrRequestList>(`/request?${search.toString()}`);
}

export type SeerrIssueType = 1 | 2 | 3 | 4; // 1=Video, 2=Audio, 3=Subtitle, 4=Other

export async function submitSeerrIssue(input: {
  mediaId: number;
  issueType: SeerrIssueType;
  message: string;
  problemSeason?: number;
  problemEpisode?: number;
}): Promise<{ success: boolean; message?: string; issueId?: number }> {
  const config = await resolveSeerrConfig();
  if (!config) {
    console.error("[seerr/issue] Seerr is not configured");
    return { success: false, message: "Seerr is not configured" };
  }

  const body: Record<string, unknown> = {
    mediaId: input.mediaId,
    issueType: input.issueType,
    message: input.message,
  };
  if (typeof input.problemSeason === "number") body.problemSeason = input.problemSeason;
  if (typeof input.problemEpisode === "number") body.problemEpisode = input.problemEpisode;

  const url = `${config.apiUrl}/issue`;
  console.log("[seerr/issue] POST", url, JSON.stringify(body));

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "X-Api-Key": config.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    const rawText = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
    } catch {
      // non-JSON body
    }
    if (!res.ok) {
      console.error(
        `[seerr/issue] ${res.status} ${res.statusText} — body:`,
        rawText.slice(0, 500),
      );
      const message =
        (typeof data?.message === "string" && data.message) ||
        `Seerr returned ${res.status}`;
      return { success: false, message };
    }
    const issueId = typeof data?.id === "number" ? data.id : undefined;
    console.log(`[seerr/issue] OK ${res.status} — issue id:`, issueId ?? "(none)");
    return { success: true, issueId };
  } catch (error) {
    console.error("[seerr/issue] fetch threw:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Issue submission failed",
    };
  }
}

export async function cancelSeerrRequest(
  requestId: number,
): Promise<{ success: boolean; message?: string }> {
  const config = await resolveSeerrConfig();
  if (!config) {
    console.error("[seerr/cancel] Seerr is not configured");
    return { success: false, message: "Seerr is not configured" };
  }

  const url = `${config.apiUrl}/request/${requestId}`;
  console.log("[seerr/cancel] DELETE", url);
  try {
    const res = await fetch(url, {
      method: "DELETE",
      headers: { "X-Api-Key": config.apiKey },
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 204 || res.ok) {
      console.log(`[seerr/cancel] OK ${res.status}`);
      return { success: true };
    }
    const body = await res.text().catch(() => "");
    console.error(`[seerr/cancel] ${res.status} ${res.statusText} — ${body.slice(0, 300)}`);
    return { success: false, message: `Seerr returned ${res.status}` };
  } catch (error) {
    console.error("[seerr/cancel] fetch threw:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Cancel failed",
    };
  }
}

"use server";

import { resolveSeerrConfig } from "./seerr";

interface RequestResult {
  success: boolean;
  message: string;
  seerrRequestId?: number;
}

async function postSeerrRequest(
  body: Record<string, unknown>,
): Promise<RequestResult> {
  const config = await resolveSeerrConfig();
  if (!config) return { success: false, message: "Seerr is not configured" };

  try {
    const response = await fetch(`${config.apiUrl}/request`, {
      method: "POST",
      headers: {
        "X-Api-Key": config.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        success: false,
        message: data?.message || `Seerr returned ${response.status}`,
      };
    }

    return {
      success: true,
      message: "Requested",
      seerrRequestId: typeof data?.id === "number" ? data.id : undefined,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Request failed",
    };
  }
}

export async function requestMovie(tmdbId: number): Promise<RequestResult> {
  return postSeerrRequest({
    mediaType: "movie",
    mediaId: tmdbId,
    is4k: false,
  });
}

export async function requestTvShow(tmdbId: number): Promise<RequestResult> {
  return postSeerrRequest({
    mediaType: "tv",
    mediaId: tmdbId,
    seasons: [],
    is4k: false,
  });
}

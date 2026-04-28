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
  if (!config) {
    console.error("[seerr/request] Seerr is not configured (no env vars or cookie)");
    return { success: false, message: "Requests aren't available right now" };
  }

  const url = `${config.apiUrl}/request`;
  console.log("[seerr/request] POST", url, JSON.stringify(body));

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "X-Api-Key": config.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });

    const rawText = await response.text();
    let data: Record<string, unknown> = {};
    try {
      data = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
    } catch {
      // non-JSON response body
    }

    if (!response.ok) {
      console.error(
        `[seerr/request] ${response.status} ${response.statusText} — body:`,
        rawText.slice(0, 500),
      );
      const message =
        (typeof data?.message === "string" && data.message) ||
        "Couldn't submit your request";
      return { success: false, message };
    }

    const seerrRequestId =
      typeof data?.id === "number" ? data.id : undefined;
    console.log(
      `[seerr/request] OK ${response.status} — request id:`,
      seerrRequestId ?? "(none)",
    );
    return { success: true, message: "Requested", seerrRequestId };
  } catch (error) {
    console.error("[seerr/request] fetch threw:", error);
    return { success: false, message: "Couldn't submit your request" };
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
    seasons: "all",
    is4k: false,
  });
}

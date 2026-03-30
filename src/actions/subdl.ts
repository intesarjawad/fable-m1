"use server";

const SUBDL_BASE = "https://api.subdl.com/api/v1/subtitles";

function resolveSubdlApiKey(): string | null {
  return process.env.SUBDL_API_KEY || null;
}

export interface SubdlSubtitle {
  releaseName: string;
  language: string;
  languageCode: string;
  author: string;
  url: string;
  hearingImpaired: boolean;
}

export interface SubdlSearchResult {
  subtitles: SubdlSubtitle[];
}

export async function searchSubdlSubtitles(
  imdbId: string,
  options?: {
    type?: "movie" | "tv";
    seasonNumber?: number;
    episodeNumber?: number;
    languages?: string;
  }
): Promise<SubdlSearchResult> {
  const apiKey = resolveSubdlApiKey();
  if (!apiKey) return { subtitles: [] };

  const params = new URLSearchParams({
    api_key: apiKey,
    imdb_id: imdbId,
    subs_per_page: "15",
  });

  if (options?.type) params.set("type", options.type);
  if (options?.seasonNumber) params.set("season_number", String(options.seasonNumber));
  if (options?.episodeNumber) params.set("episode_number", String(options.episodeNumber));
  if (options?.languages) params.set("languages", options.languages);

  try {
    const response = await fetch(`${SUBDL_BASE}?${params}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return { subtitles: [] };

    const data = await response.json();
    if (!data.status || !data.subtitles) return { subtitles: [] };

    return {
      subtitles: data.subtitles.map((sub: any) => ({
        releaseName: sub.release_name || sub.name || "Unknown",
        language: sub.lang || "Unknown",
        languageCode: sub.language || "",
        author: sub.author || "",
        url: sub.url || "",
        hearingImpaired: Boolean(sub.hi),
      })),
    };
  } catch {
    return { subtitles: [] };
  }
}

export async function isSubdlConfigured(): Promise<boolean> {
  return resolveSubdlApiKey() !== null;
}

import { NextRequest, NextResponse } from "next/server";
import { resolveRivenConfig } from "@/src/actions/riven";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

interface RivenBackendItem {
  id: string | number;
  tmdb_id?: string;
  tvdb_id?: string;
  title: string;
  poster_path?: string;
  type: string;
  year?: number;
  aired_at?: string;
  last_state?: string;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const config = await resolveRivenConfig();
  if (!config) {
    return NextResponse.json(
      { success: false, message: "Riven is not configured" },
      { status: 503 },
    );
  }

  const incomingParams = new URL(request.url).searchParams;
  const baseUrl = config.apiUrl.replace(/\/+$/, "");
  const targetUrl = new URL(`${baseUrl}/api/v1/items`);

  const sort = incomingParams.get("sort");
  targetUrl.searchParams.set("sort", sort ?? "date_desc");

  const limit = incomingParams.get("limit");
  targetUrl.searchParams.set("limit", limit ?? "15");

  const page = incomingParams.get("page");
  targetUrl.searchParams.set("page", page ?? "1");

  // Support multiple type= values
  const types = incomingParams.getAll("type");
  if (types.length > 0) {
    for (const mediaType of types) {
      targetUrl.searchParams.append("type", mediaType);
    }
  } else {
    targetUrl.searchParams.append("type", "movie");
    targetUrl.searchParams.append("type", "show");
  }

  const search = incomingParams.get("search");
  if (search) targetUrl.searchParams.set("search", search);

  const states = incomingParams.getAll("states");
  for (const state of states) {
    targetUrl.searchParams.append("states", state);
  }

  // Log the URL (without the key) for diagnosing connectivity issues
  const loggableUrl = targetUrl.toString();
  console.log(`[riven/library] Fetching: ${loggableUrl}`);

  try {
    const response = await fetch(targetUrl.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-api-key": config.apiKey,
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(
        `[riven/library] Request failed: ${response.status} ${response.statusText} — URL: ${loggableUrl}`,
        body,
      );
      return NextResponse.json(
        { success: false, message: `Riven returned ${response.status}` },
        { status: response.status },
      );
    }

    const data = await response.json();

    const items = (data.items ?? []).map((item: RivenBackendItem) => {
      const posterIsAbsolute = item.poster_path?.startsWith("http");

      let id: string | number;
      let indexer: string;

      if (item.tmdb_id) {
        id = parseInt(item.tmdb_id, 10);
        indexer = "tmdb";
      } else if (item.tvdb_id) {
        id = parseInt(item.tvdb_id, 10);
        indexer = "tvdb";
      } else {
        if (typeof item.id === "string") {
          const parsed = parseInt(item.id, 10);
          id = Number.isNaN(parsed) ? item.id : parsed;
        } else {
          id = item.id;
        }
        indexer = "riven";
      }

      return {
        id,
        indexer,
        title: item.title,
        poster_path: item.poster_path
          ? posterIsAbsolute
            ? item.poster_path
            : `${TMDB_IMAGE_BASE}/w500${item.poster_path}`
          : null,
        media_type: item.type === "show" ? "tv" : item.type,
        year:
          item.year ??
          (item.aired_at ? new Date(item.aired_at).getFullYear() : "N/A"),
        riven_id: item.id,
        state: item.last_state ?? null,
      };
    });

    return NextResponse.json({
      items,
      page: data.page,
      total_pages: data.total_pages,
      total_results: data.total_items,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network error";
    return NextResponse.json(
      { success: false, message: `Riven server unreachable: ${message}` },
      { status: 502 },
    );
  }
}

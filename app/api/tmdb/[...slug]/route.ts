import { getTmdbConfig } from "@/src/actions/store/server-actions";
import { NextRequest, NextResponse } from "next/server";

const TMDB_BASE = "https://api.themoviedb.org/3";

async function resolveTmdbApiKey(): Promise<string | null> {
  const cookieConfig = await getTmdbConfig();
  if (cookieConfig?.apiKey) return cookieConfig.apiKey;
  return process.env.TMDB_API_KEY || null;
}

async function handleTmdbProxy(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const apiKey = await resolveTmdbApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { success: false, message: "TMDB not configured" },
      { status: 503 }
    );
  }

  const { slug } = await params;
  const path = slug.join("/");
  const searchParams = new URL(request.url).searchParams;
  searchParams.set("api_key", apiKey);

  const targetUrl = `${TMDB_BASE}/${path}?${searchParams.toString()}`;

  try {
    const response = await fetch(targetUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "TMDB request failed";
    return NextResponse.json(
      { success: false, message },
      { status: 502 }
    );
  }
}

export const GET = handleTmdbProxy;

import { NextResponse } from "next/server";
import { fetchSeerrMovieInfo, fetchSeerrTvInfo } from "@/src/actions/seerr";

interface RouteParams {
  params: Promise<{ type: string; tmdbId: string }>;
}

export async function GET(_: Request, props: RouteParams): Promise<NextResponse> {
  const { type, tmdbId } = await props.params;
  const id = Number(tmdbId);
  if (!id || Number.isNaN(id)) {
    return NextResponse.json(
      { success: false, message: "Invalid TMDB id" },
      { status: 400 },
    );
  }

  if (type !== "movie" && type !== "tv") {
    return NextResponse.json(
      { success: false, message: "type must be 'movie' or 'tv'" },
      { status: 400 },
    );
  }

  if (type === "movie") {
    const mediaInfo = await fetchSeerrMovieInfo(id);
    return NextResponse.json({ mediaInfo, seasons: [] });
  }

  const tvData = await fetchSeerrTvInfo(id);
  return NextResponse.json({
    mediaInfo: tvData?.mediaInfo ?? null,
    seasons: tvData?.seasons ?? [],
  });
}

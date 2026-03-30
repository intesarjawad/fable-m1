import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    hasEnvConfig: Boolean(process.env.TMDB_API_KEY),
  });
}

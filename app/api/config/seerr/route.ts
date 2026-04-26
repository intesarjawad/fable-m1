import { NextResponse } from "next/server";

export async function GET(): Promise<NextResponse> {
  const envApiUrl = process.env.SEERR_API_URL || null;
  const hasEnvConfig = !!(envApiUrl && process.env.SEERR_API_KEY);

  return NextResponse.json({ envApiUrl, hasEnvConfig });
}

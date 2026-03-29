import { NextResponse } from "next/server";

export async function GET() {
  const envApiUrl = process.env.RIVEN_API_URL || null;
  const hasEnvConfig = !!(envApiUrl && process.env.RIVEN_API_KEY);

  return NextResponse.json({ hasEnvConfig, envApiUrl });
}

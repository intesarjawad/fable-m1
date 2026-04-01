import { NextRequest, NextResponse } from "next/server";
import { resolveRivenConfig } from "@/src/actions/riven";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const config = await resolveRivenConfig();
  if (!config) {
    return NextResponse.json(
      { success: false, message: "Riven is not configured" },
      { status: 503 },
    );
  }

  const baseUrl = config.apiUrl.replace(/\/+$/, "");

  try {
    const body = await request.text();
    const response = await fetch(`${baseUrl}/api/v1/items/reset`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-api-key": config.apiKey,
      },
      body,
      signal: AbortSignal.timeout(15000),
    });

    if (response.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network error";
    return NextResponse.json(
      { success: false, message: `Riven server unreachable: ${message}` },
      { status: 502 },
    );
  }
}

import { NextResponse } from "next/server";
import { resolveRivenConfig } from "@/src/actions/riven";

export async function GET(): Promise<NextResponse> {
  const config = await resolveRivenConfig();
  if (!config) {
    return NextResponse.json(
      { success: false, message: "Riven is not configured" },
      { status: 503 },
    );
  }

  const baseUrl = config.apiUrl.replace(/\/+$/, "");
  const calendarUrl = `${baseUrl}/api/v1/calendar`;

  console.log(`[riven/calendar] Fetching: ${calendarUrl}`);

  try {
    const response = await fetch(calendarUrl, {
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
        `[riven/calendar] Request failed: ${response.status} ${response.statusText} — URL: ${calendarUrl}`,
        body,
      );
      return NextResponse.json(
        { success: false, message: `Riven returned ${response.status}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network error";
    return NextResponse.json(
      { success: false, message: `Riven server unreachable: ${message}` },
      { status: 502 },
    );
  }
}

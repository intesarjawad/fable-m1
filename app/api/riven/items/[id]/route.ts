import { NextRequest, NextResponse } from "next/server";
import { resolveRivenConfig } from "@/src/actions/riven";

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const config = await resolveRivenConfig();
  if (!config) {
    return NextResponse.json(
      { success: false, message: "Riven is not configured" },
      { status: 503 },
    );
  }

  const { id } = await props.params;
  if (!id || isNaN(Number(id))) {
    return NextResponse.json(
      { success: false, message: "Invalid item ID" },
      { status: 400 },
    );
  }

  const incomingParams = new URL(request.url).searchParams;
  const mediaType = incomingParams.get("media_type");

  const baseUrl = config.apiUrl.replace(/\/+$/, "");
  const targetUrl = new URL(`${baseUrl}/api/v1/items/${id}`);
  targetUrl.searchParams.set("extended", "true");
  if (mediaType) targetUrl.searchParams.set("media_type", mediaType);

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

import { NextRequest } from "next/server";
import { resolveRivenConfig } from "@/src/actions/riven";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventType: string }> }
) {
  const config = await resolveRivenConfig();
  if (!config) {
    return new Response("Riven not configured", { status: 503 });
  }

  const { eventType } = await params;
  const baseUrl = config.apiUrl.replace(/\/+$/, "");
  const upstreamUrl = `${baseUrl}/api/v1/stream/${eventType}`;

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      headers: {
        "x-api-key": config.apiKey,
        Accept: "text/event-stream",
      },
      // No timeout — SSE connections are long-lived
    });

    if (!upstreamResponse.ok || !upstreamResponse.body) {
      return new Response("Failed to connect to Riven SSE", {
        status: upstreamResponse.status,
      });
    }

    // Pipe the upstream SSE stream directly to the client
    return new Response(upstreamResponse.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch {
    return new Response("Riven SSE unreachable", { status: 502 });
  }
}

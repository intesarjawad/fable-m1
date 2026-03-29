import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

interface AuthData {
  serverUrl: string;
  user: any;
}

async function getAuth(): Promise<AuthData | null> {
  const cookieStore = await cookies();
  const val = cookieStore.get("jellyfin-auth");
  if (!val?.value) return null;
  try {
    return JSON.parse(val.value) as AuthData;
  } catch {
    return null;
  }
}

/**
 * Generic SyncPlay proxy. Forwards requests to the Jellyfin server.
 * Used for all SyncPlay operations to avoid server action hash issues.
 *
 * POST /api/syncplay/proxy
 * Body: { path: "/SyncPlay/Seek", method?: "POST", body?: { PositionTicks: 123 } }
 */
export async function POST(req: NextRequest) {
  const auth = await getAuth();
  if (!auth) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const token = auth.user?.AccessToken;
  if (!token) {
    return NextResponse.json({ error: "No token" }, { status: 401 });
  }

  const { path, method, body } = await req.json();
  if (!path) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  const baseUrl = auth.serverUrl.replace(/\/+$/, "");

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: method || "POST",
      headers: {
        Authorization: `MediaBrowser Token="${token}"`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.status === 204) {
      return NextResponse.json({ success: true });
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return NextResponse.json(
        { error: `Jellyfin ${response.status}: ${errorText}` },
        { status: response.status },
      );
    }

    const text = await response.text();
    if (!text) {
      return NextResponse.json({ success: true });
    }

    try {
      return NextResponse.json(JSON.parse(text));
    } catch {
      return NextResponse.json({ success: true });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Network error" },
      { status: 502 },
    );
  }
}

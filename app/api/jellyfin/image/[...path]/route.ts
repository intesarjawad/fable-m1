import { NextRequest, NextResponse } from "next/server";
import { getAuthData } from "@/src/actions/store/server-actions";

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const authData = await getAuthData();
  if (!authData) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { serverUrl, user } = authData;
  const { path } = await props.params;
  const jellyfinPath = path.join("/");

  const incomingParams = new URL(request.url).searchParams;
  const queryString = incomingParams.toString();
  const targetUrl = `${serverUrl}/Items/${jellyfinPath}${queryString ? `?${queryString}` : ""}`;

  try {
    const response = await fetch(targetUrl, {
      headers: {
        Authorization: `MediaBrowser Token="${user.AccessToken}"`,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return new NextResponse(null, { status: response.status });
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const imageBuffer = await response.arrayBuffer();

    return new NextResponse(imageBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { resolveRivenConfig } from "@/src/actions/riven";
import { getAuthData } from "@/src/actions/store/server-actions";

async function isAdminUser(): Promise<boolean> {
  try {
    const authData = await getAuthData();
    const user = authData?.user as any;
    return Boolean(
      user?.Policy?.IsAdministrator || user?.User?.Policy?.IsAdministrator,
    );
  } catch {
    return false;
  }
}

async function proxyToRiven(
  req: NextRequest,
  slug: string[],
  method: string,
): Promise<NextResponse> {
  const config = await resolveRivenConfig();
  if (!config) {
    return NextResponse.json(
      { success: false, message: "Riven is not configured" },
      { status: 503 },
    );
  }

  // Non-admin users can only perform GET requests
  if (method !== "GET") {
    const admin = await isAdminUser();
    if (!admin) {
      return NextResponse.json(
        { success: false, message: "Admin access required" },
        { status: 403 },
      );
    }
  }

  const baseUrl = config.apiUrl.replace(/\/+$/, "");
  const path = slug.join("/");
  const url = new URL(req.url);
  const queryString = url.searchParams.toString();
  const fullUrl = `${baseUrl}/api/v1/${path}${queryString ? `?${queryString}` : ""}`;

  try {
    const fetchOptions: RequestInit = {
      method,
      headers: {
        "x-api-key": config.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15000),
    };

    if (method !== "GET" && method !== "HEAD") {
      try {
        const body = await req.text();
        if (body) {
          fetchOptions.body = body;
        }
      } catch {
        // No body — fine for some POST/DELETE requests
      }
    }

    const response = await fetch(fullUrl, fetchOptions);

    if (response.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Network error";
    return NextResponse.json(
      { success: false, message: `Riven server unreachable: ${message}` },
      { status: 502 },
    );
  }
}

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await props.params;
  return proxyToRiven(req, slug, "GET");
}

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await props.params;
  return proxyToRiven(req, slug, "POST");
}

export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await props.params;
  return proxyToRiven(req, slug, "DELETE");
}

export async function PUT(
  req: NextRequest,
  props: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await props.params;
  return proxyToRiven(req, slug, "PUT");
}

import { NextResponse } from "next/server";
import { fetchSeerrRequestCount } from "@/src/actions/seerr";

export async function GET(): Promise<NextResponse> {
  const count = await fetchSeerrRequestCount();
  return NextResponse.json(count ?? null);
}

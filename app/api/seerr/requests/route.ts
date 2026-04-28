import { NextRequest, NextResponse } from "next/server";
import { fetchSeerrRequests } from "@/src/actions/seerr";

type RequestFilter =
  | "all"
  | "available"
  | "pending"
  | "approved"
  | "processing"
  | "unavailable";
type RequestSort = "added" | "modified" | "mediaAdded";

const VALID_FILTERS: Set<RequestFilter> = new Set([
  "all",
  "available",
  "pending",
  "approved",
  "processing",
  "unavailable",
]);
const VALID_SORTS: Set<RequestSort> = new Set(["added", "modified", "mediaAdded"]);

function parseFilter(raw: string | null): RequestFilter {
  if (raw && (VALID_FILTERS as Set<string>).has(raw)) return raw as RequestFilter;
  return "all";
}

function parseSort(raw: string | null): RequestSort {
  if (raw && (VALID_SORTS as Set<string>).has(raw)) return raw as RequestSort;
  return "added";
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sp = req.nextUrl.searchParams;
  const take = Number(sp.get("take") ?? "20");
  const skip = Number(sp.get("skip") ?? "0");

  const data = await fetchSeerrRequests({
    filter: parseFilter(sp.get("filter")),
    sort: parseSort(sp.get("sort")),
    take: Number.isFinite(take) ? take : 20,
    skip: Number.isFinite(skip) ? skip : 0,
  });

  return NextResponse.json(data ?? null);
}

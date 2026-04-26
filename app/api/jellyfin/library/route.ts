import { NextRequest, NextResponse } from "next/server";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api/items-api";
import { ItemFields } from "@jellyfin/sdk/lib/generated-client/models/item-fields";
import { ItemSortBy } from "@jellyfin/sdk/lib/generated-client/models/item-sort-by";
import { SortOrder } from "@jellyfin/sdk/lib/generated-client/models/sort-order";
import { BaseItemKind } from "@jellyfin/sdk/lib/generated-client/models/base-item-kind";

import { getAuthData } from "@/src/actions/media";
import { createJellyfinInstance } from "@/src/lib/utils";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

interface LibraryResponseItem {
  id: number | string;
  indexer: "tmdb" | "tvdb" | "jellyfin";
  title: string;
  poster_path: string | null;
  media_type: "movie" | "tv";
  year: number | string;
  jellyfin_id: string;
  state: string | null;
}

const SORT_MAP: Record<
  string,
  { sortBy: ItemSortBy; sortOrder: SortOrder }
> = {
  date_desc: { sortBy: ItemSortBy.DateCreated, sortOrder: SortOrder.Descending },
  date_asc: { sortBy: ItemSortBy.DateCreated, sortOrder: SortOrder.Ascending },
  title_asc: { sortBy: ItemSortBy.SortName, sortOrder: SortOrder.Ascending },
  title_desc: { sortBy: ItemSortBy.SortName, sortOrder: SortOrder.Descending },
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  let auth;
  try {
    auth = await getAuthData();
  } catch {
    return NextResponse.json(
      { success: false, message: "Not authenticated" },
      { status: 401 },
    );
  }

  const { serverUrl, user } = auth;
  if (!user.AccessToken) {
    return NextResponse.json(
      { success: false, message: "Missing access token" },
      { status: 401 },
    );
  }

  const params = new URL(request.url).searchParams;
  const sortKey = params.get("sort") ?? "date_desc";
  const sortConfig = SORT_MAP[sortKey] ?? SORT_MAP.date_desc;

  const limit = Math.min(Math.max(Number(params.get("limit") ?? "24"), 1), 200);
  const page = Math.max(Number(params.get("page") ?? "1"), 1);
  const startIndex = (page - 1) * limit;

  const search = params.get("search")?.trim() || undefined;

  const requestedTypes = params.getAll("type");
  const includeItemTypes: BaseItemKind[] = [];
  if (requestedTypes.length === 0) {
    includeItemTypes.push(BaseItemKind.Movie, BaseItemKind.Series);
  } else {
    if (requestedTypes.includes("movie")) {
      includeItemTypes.push(BaseItemKind.Movie);
    }
    if (requestedTypes.includes("show") || requestedTypes.includes("tv")) {
      includeItemTypes.push(BaseItemKind.Series);
    }
  }

  const jellyfin = createJellyfinInstance();
  const api = jellyfin.createApi(serverUrl);
  api.accessToken = user.AccessToken;
  const itemsApi = getItemsApi(api);

  try {
    const { data } = await itemsApi.getItems({
      userId: user.Id,
      includeItemTypes,
      recursive: true,
      sortBy: [sortConfig.sortBy],
      sortOrder: [sortConfig.sortOrder],
      limit,
      startIndex,
      searchTerm: search,
      fields: [ItemFields.ProviderIds, ItemFields.PrimaryImageAspectRatio],
      enableImages: true,
    });

    const totalResults = data.TotalRecordCount ?? 0;
    const totalPages = Math.max(Math.ceil(totalResults / limit), 1);

    const items: LibraryResponseItem[] = (data.Items ?? []).map((item) => {
      const tmdbIdStr = item.ProviderIds?.Tmdb;
      const tvdbIdStr = item.ProviderIds?.Tvdb;
      const tmdbId = tmdbIdStr ? parseInt(tmdbIdStr, 10) : NaN;
      const tvdbId = tvdbIdStr ? parseInt(tvdbIdStr, 10) : NaN;

      let id: number | string;
      let indexer: "tmdb" | "tvdb" | "jellyfin";
      if (!Number.isNaN(tmdbId)) {
        id = tmdbId;
        indexer = "tmdb";
      } else if (!Number.isNaN(tvdbId)) {
        id = tvdbId;
        indexer = "tvdb";
      } else {
        id = item.Id ?? "";
        indexer = "jellyfin";
      }

      const tmdbPoster = tmdbIdStr && item.ImageTags?.Primary
        ? null
        : null;
      // Always use Jellyfin's image proxy — TMDB poster paths aren't available here
      const posterUrl = item.ImageTags?.Primary && item.Id
        ? `/api/jellyfin/image/${item.Id}/Images/Primary?maxHeight=600`
        : tmdbPoster;

      return {
        id,
        indexer,
        title: item.Name ?? "Untitled",
        poster_path: posterUrl,
        media_type: item.Type === BaseItemKind.Series ? "tv" : "movie",
        year: item.ProductionYear ?? "N/A",
        jellyfin_id: item.Id ?? "",
        state: null,
      };
    });

    return NextResponse.json({
      items,
      page,
      total_pages: totalPages,
      total_results: totalResults,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network error";
    console.error(`[jellyfin/library] ${message}`);
    return NextResponse.json(
      { success: false, message: `Jellyfin unreachable: ${message}` },
      { status: 502 },
    );
  }
}

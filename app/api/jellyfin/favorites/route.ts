import { getAuthData } from "@/src/actions/store/server-actions";
import { NextResponse } from "next/server";

interface JellyfinFavoriteItem {
  Id: string;
  Name: string;
  Type: string;
  ProductionYear?: number;
  ProviderIds?: {
    Tmdb?: string;
    [key: string]: string | undefined;
  };
}

interface NormalizedWatchlistItem {
  id: string;
  title: string;
  poster_path: string;
  media_type: "movie" | "tv";
  year: number | null;
  jellyfin_id: string;
}

export async function GET() {
  try {
    const authData = await getAuthData();

    if (!authData) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { serverUrl, user } = authData;

    if (!user.AccessToken) {
      return NextResponse.json(
        { error: "No access token found" },
        { status: 401 },
      );
    }

    const params = new URLSearchParams({
      Filters: "IsFavorite",
      Recursive: "true",
      Fields: "PrimaryImageAspectRatio,Overview,ProviderIds",
      EnableImages: "true",
      Limit: "20",
      SortBy: "DateCreated",
      SortOrder: "Descending",
    });

    const response = await fetch(
      `${serverUrl}/Users/${(user as any).Id || (user as any).User?.Id}/Items?${params.toString()}`,
      {
        headers: {
          Authorization: `MediaBrowser Token="${user.AccessToken}"`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      const status = response.status;
      if (status === 401 || status === 403) {
        return NextResponse.json(
          { error: "Authentication expired. Please sign in again." },
          { status: 401 },
        );
      }
      return NextResponse.json(
        { error: "Failed to fetch favorites from Jellyfin" },
        { status: response.status },
      );
    }

    const jellyfinData = await response.json();
    const rawItems: JellyfinFavoriteItem[] = jellyfinData.Items ?? [];

    const normalizedItems: NormalizedWatchlistItem[] = rawItems.map((item) => ({
      id: item.ProviderIds?.Tmdb ?? item.Id,
      title: item.Name,
      poster_path: `${serverUrl}/Items/${item.Id}/Images/Primary?maxHeight=400`,
      media_type: item.Type === "Movie" ? "movie" : "tv",
      year: item.ProductionYear ?? null,
      jellyfin_id: item.Id,
    }));

    return NextResponse.json({ items: normalizedItems });
  } catch (error) {
    console.error("Failed to fetch Jellyfin favorites:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

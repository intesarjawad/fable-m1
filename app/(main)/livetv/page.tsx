"use client";
import { fetchLiveTVItems } from "@/src/actions";
import { getAuthData } from "@/src/actions/utils";
import { LibraryMediaList } from "@/src/components/library-media-list";
import {
  BaseItemDto,
  ItemSortBy,
} from "@jellyfin/sdk/lib/generated-client/models";
import { useEffect, useState } from "react";
import LoadingSpinner from "@/src/components/loading-spinner";
import ErrorWindow from "@/src/components/error-window";
import { useAuthError } from "@/src/hooks/use-auth-error";

const libraryName = "Live TV";

export default function LiveTVPage() {
  const [libraryItems, setLibraryItems] = useState<BaseItemDto[]>([]);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const { handleAuthError } = useAuthError();

  useEffect(() => {
    async function fetchLibraryData() {
      try {
        // Get auth info
        const authData = await getAuthData();
        setServerUrl(authData.serverUrl);

        const libraryItems = await fetchLiveTVItems();

        if (!libraryItems) {
          return;
        }

        setLibraryItems(libraryItems.items);
      } catch (err: any) {
        console.error(err);
        if (handleAuthError(err)) return;
      } finally {
        setLoading(false);
      }
    }

    fetchLibraryData();
  }, []);

  if (loading) return <LoadingSpinner />;

  if (serverUrl == null)
    return <ErrorWindow message="Error loading Live TV. Please try again." />;

  return (
    <div className="relative px-4 pt-16 pb-3 max-w-full overflow-hidden">
      {/* Main content with higher z-index */}
      <div className="relative z-10">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-3xl font-semibold text-foreground font-poppins">
              {libraryName}
            </h2>
          </div>
          <span className="font-mono text-muted-foreground">
            {libraryItems.length} items
          </span>
        </div>
        <LibraryMediaList
          mediaItems={libraryItems}
          serverUrl={serverUrl}
          initialSortField={ItemSortBy.IsFavoriteOrLiked}
        />
      </div>
    </div>
  );
}

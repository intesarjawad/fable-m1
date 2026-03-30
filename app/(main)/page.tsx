"use client";
import {
  fetchResumeItems,
  fetchLibraryItems,
  fetchLiveTVItems,
  fetchNextUpItems,
} from "@/src/actions/media";
import { getAuthData, getUserLibraries } from "@/src/actions/utils";
import {
  fetchTrendingMovies,
  fetchTrendingTv,
  fetchPopularMovies,
  fetchPopularTv,
  isTmdbConfigured,
} from "@/src/actions/tmdb";
import { useAuthError } from "@/src/hooks/use-auth-error";
import { MediaSection } from "@/src/components/media-section";
import { DiscoverySection } from "@/src/components/discovery-section";
import { SearchBar } from "@/src/components/search-component";
import { AuroraBackground } from "@/src/components/aurora-background";
import { useEffect, useState } from "react";
import { useAtom } from "jotai";
import {
  homeLastVisitedTimeAtom,
  homeServerUrlAtom,
  homeUserAtom,
  homeResumeItemsAtom,
  homeNextupItemsAtom,
  homeLibrariesAtom,
  homeTrendingAtom,
  homePopularMoviesAtom,
  homePopularTvAtom,
  discoveryLastFetchedAtom,
} from "@/src/lib/atoms";
import LoadingSpinner from "@/src/components/loading-spinner";
import { HeroSection } from "@/src/components/hero/hero-section";
import { useRouter } from "next/navigation";
import ErrorWindow from "@/src/components/error-window";
import { TrendingUp, Flame } from "lucide-react";
import { useRequestState } from "@/src/hooks/use-request-state";
import { useReconcileRequests } from "@/src/hooks/use-reconcile-requests";
import { tmdbPosterUrl } from "@/src/lib/tmdb";
import { OptimizedImage } from "@/src/components/optimized-image";
import { ScrollArea, ScrollBar } from "@/src/components/ui/scroll-area";

const MAX_DISCOVERY_ITEMS = 20;

export default function Home() {
  const router = useRouter();

  const [serverUrl, setServerUrl] = useAtom(homeServerUrlAtom);
  const [user, setUser] = useAtom(homeUserAtom);
  const [resumeItems, setResumeItems] = useAtom(homeResumeItemsAtom);
  const [nextupItems, setNextupItems] = useAtom(homeNextupItemsAtom);
  const [libraries, setLibraries] = useAtom(homeLibrariesAtom);
  const [lastVisitedTime, setLastVisitedTime] = useAtom(homeLastVisitedTimeAtom);

  const [homeTrending, setHomeTrending] = useAtom(homeTrendingAtom);
  const [homePopularMovies, setHomePopularMovies] = useAtom(homePopularMoviesAtom);
  const [homePopularTv, setHomePopularTv] = useAtom(homePopularTvAtom);
  const [discoveryLastFetched, setDiscoveryLastFetched] = useAtom(discoveryLastFetchedAtom);

  const { activeRequests } = useRequestState();
  useReconcileRequests();
  const { handleAuthError } = useAuthError();
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const now = Date.now();
    // Only refetch if 60 seconds have passed since the page was last visited
    if (now - lastVisitedTime < 60000) {
      setLastVisitedTime(Date.now());
      setLoading(false);
      return;
    }
    async function fetchData() {
      try {
        const authData = await getAuthData();
        setServerUrl(authData.serverUrl);
        setUser(authData.user);

        // Fetch resume items and libraries in parallel
        const [resumeItemsResult, nextupItemsResult, userLibraries] =
          await Promise.all([
            fetchResumeItems(),
            fetchNextUpItems(),
            getUserLibraries(),
          ]);

        setResumeItems(resumeItemsResult);
        setNextupItems(
          nextupItemsResult.filter(
            (item) =>
              !resumeItemsResult.some(
                (resumeItem) => resumeItem.Id === item.Id,
              ),
          ),
        );

        // Fetch items for each library in parallel
        const libraryData = await Promise.all(
          userLibraries.map(async (library) => {
            const items =
              library.CollectionType === "livetv"
                ? (await fetchLiveTVItems(true)).items
                : (await fetchLibraryItems({ id: library.Id!, collectionType: library.CollectionType }, 12)).items;
            return { library, items };
          }),
        );

        setLibraries(libraryData);
        setLastVisitedTime(Date.now());

        // Fetch TMDB discovery data (with its own 60s cache)
        const shouldFetchDiscovery = now - discoveryLastFetched >= 60000;
        if (shouldFetchDiscovery) {
          const tmdbConfigured = await isTmdbConfigured();
          if (tmdbConfigured) {
            const [trendingMovies, trendingTv, popularMovies, popularTv] =
              await Promise.all([
                fetchTrendingMovies(),
                fetchTrendingTv(),
                fetchPopularMovies(),
                fetchPopularTv(),
              ]);

            // Merge trending movies + TV into a single mixed list, sorted by popularity
            const trending = [...trendingMovies, ...trendingTv]
              .sort((a, b) => b.popularity - a.popularity)
              .slice(0, MAX_DISCOVERY_ITEMS);

            setHomeTrending(trending);
            setHomePopularMovies(popularMovies.slice(0, MAX_DISCOVERY_ITEMS));
            setHomePopularTv(popularTv.slice(0, MAX_DISCOVERY_ITEMS));
            setDiscoveryLastFetched(Date.now());
          }
        }
      } catch (error: unknown) {
        console.error("Failed to load data:", error);

        if (handleAuthError(error)) {
          return;
        }
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [router]);

  if (loading) return <LoadingSpinner />;

  if (!libraries || serverUrl == null)
    return (
      <ErrorWindow message="Error loading Home Page. Please try again." />
    );

  const firstLibrary = libraries[0];
  const remainingLibraries = libraries.slice(1);

  return (
      <div className="relative px-4 py-3 max-w-full overflow-hidden">
        <AuroraBackground />

        <div className="relative z-99 mb-8">
          <div className="mb-6">
            <SearchBar />
          </div>
        </div>

        <div className="relative z-10 mb-4">
          <h2 className="text-3xl font-semibold text-foreground mb-2 font-poppins">
            Welcome back, {user?.Name}
          </h2>
          <p className="text-muted-foreground mb-6">
            Continue watching or discover something new
          </p>
        </div>

        <HeroSection serverUrl={serverUrl} />

        {resumeItems.length > 0 && (
          <MediaSection
            sectionName="Continue Watching"
            mediaItems={resumeItems}
            serverUrl={serverUrl}
            continueWatching
            hideViewAll
          />
        )}

        {nextupItems.length > 0 && (
          <MediaSection
            sectionName="Next Up"
            mediaItems={nextupItems}
            serverUrl={serverUrl}
            continueWatching
            hideViewAll
          />
        )}

        {activeRequests.length > 0 && (
          <MyRequestsRow requests={activeRequests} />
        )}

        {homeTrending.length > 0 && (
          <DiscoverySection
            sectionName="Trending This Week"
            items={homeTrending}
            icon={<TrendingUp className="h-6 w-6 text-emerald-400" />}
          />
        )}

        {firstLibrary && (
          <MediaSection
            key={firstLibrary.library.Id}
            library={firstLibrary.library}
            sectionName={firstLibrary.library.Name}
            mediaItems={firstLibrary.items}
            serverUrl={serverUrl}
          />
        )}

        {homePopularMovies.length > 0 && (
          <DiscoverySection
            sectionName="Popular Movies"
            items={homePopularMovies}
            icon={<Flame className="h-6 w-6 text-orange-400" />}
          />
        )}

        {remainingLibraries.map(({ library, items }) => (
          <MediaSection
            key={library.Id}
            library={library}
            sectionName={library.Name}
            mediaItems={items}
            serverUrl={serverUrl}
          />
        ))}
      </div>
  );
}

// Simple horizontal row for tracked requests (v1 — poster + title + status badge)
const STATUS_BADGE_STYLES: Record<string, string> = {
  requested: "bg-sky-500/70",
  "getting-ready": "bg-amber-500/70",
  ready: "bg-emerald-500/70",
  failed: "bg-red-500/70",
};

const STATUS_LABELS: Record<string, string> = {
  requested: "Requested",
  "getting-ready": "Getting Ready",
  ready: "Ready",
  failed: "Failed",
};

interface MyRequestsRowProps {
  requests: Array<{
    tmdbId: number;
    mediaType: "movie" | "tv";
    title: string;
    posterPath: string | null;
    status: string;
  }>;
}

function MyRequestsRow({ requests }: MyRequestsRowProps) {
  return (
    <section className="relative z-10 mb-8">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-2xl font-semibold text-foreground font-poppins">
          My Requests
        </h3>
      </div>
      <ScrollArea className="w-full pb-6">
        <div className="flex gap-4 w-max h-fit">
          {requests.map((req) => {
            const posterSrc = tmdbPosterUrl(req.posterPath, "medium");
            return (
              <div
                key={`req-${req.tmdbId}`}
                className="shrink-0 w-36 select-none"
              >
                <div className="relative w-full border rounded-md overflow-hidden aspect-[2/3]">
                  {posterSrc ? (
                    <OptimizedImage
                      src={posterSrc}
                      alt={req.title}
                      className="w-full h-full object-cover rounded-md shadow-lg"
                      draggable={false}
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-800 flex items-center justify-center rounded-md">
                      <span className="text-white/60 text-sm">No Image</span>
                    </div>
                  )}
                  <div
                    className={`absolute top-2 right-2 text-[10px] text-white px-2 py-0.5 rounded-md backdrop-blur-sm ${STATUS_BADGE_STYLES[req.status] ?? "bg-gray-500/70"}`}
                  >
                    {STATUS_LABELS[req.status] ?? req.status}
                  </div>
                </div>
                <div className="px-1">
                  <div className="mt-2.5 text-sm font-medium text-foreground truncate">
                    {req.title}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 capitalize">
                    {req.mediaType === "tv" ? "TV Show" : "Movie"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </section>
  );
}

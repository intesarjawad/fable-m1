# Content Discovery & Request System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add TMDB-powered content discovery to Fable with Riven-backed requesting, so users can browse trending/popular content and request items not yet in their Jellyfin library.

**Architecture:** TMDB API provides discovery data (trending, popular, search, genres). A server-side proxy hides the API key. Discovery cards cross-reference Jellyfin to determine availability. Unavailable items can be requested via Riven's `/api/v1/items/add`. Request state is tracked client-side (localStorage) with real-time updates via Riven SSE (`/api/v1/stream/item_update` and `/api/v1/stream/notifications`). TMDB metadata bridges the gap until Jellyfin indexes new content.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, Radix UI (Sheet, Dialog), Jotai atoms, Sonner toasts, Riven API, TMDB API v3, Jellyfin SDK, Framer Motion

---

## Critical API Notes

**TMDB Image URLs:** `https://image.tmdb.org/t/p/{size}/{path}`
- Posters: w92, w154, w185, w342, w500, w780, original
- Backdrops: w300, w780, w1280, original

**Riven POST /api/v1/items/add body:**
```json
{
  "media_type": "movie",
  "tmdb_ids": ["12345"]
}
```
For TV shows, Riven requires TVDB IDs, not TMDB IDs:
```json
{
  "media_type": "tv",
  "tvdb_ids": ["67890"]
}
```
To get a TVDB ID from a TMDB ID, call TMDB's `GET /tv/{tmdb_id}/external_ids` which returns `{ "tvdb_id": 67890, ... }`.

**Riven item states (pipeline order):** Requested → Indexed → Scraped → Downloaded → Symlinked → Completed. Terminal: Completed, Failed, Paused, Unreleased.

**Riven SSE:** `GET /api/v1/stream/{event_type}` — event types:
- `item_update` → `{ "last_state": "...", "new_state": "...", "item_id": 42, "tmdb_id": "...", "tvdb_id": "..." }`
- `notifications` → `{ "title": "...", "type": "movie"/"show", "year": 2023, "imdb_id": "...", "timestamp": "..." }`

**Riven item search:** `GET /api/v1/items?search=tmdb_12345` — prefix `tmdb_` for TMDB ID lookup.

---

## File Map

### New Files

| File | Responsibility |
|------|---------------|
| `src/types/tmdb.ts` | TMDB response types (movie, tv, search, genre) |
| `src/actions/tmdb.ts` | Server actions for TMDB data fetching |
| `app/api/tmdb/[...slug]/route.ts` | TMDB API proxy (injects API key server-side) |
| `app/api/config/tmdb/route.ts` | TMDB env config check (like Riven's) |
| `src/components/settings/tmdb-section.tsx` | Admin TMDB key settings UI |
| `src/actions/store/server-actions.ts` (additions) | TMDB config cookie storage |
| `src/lib/tmdb.ts` | TMDB image URL helpers, constants |
| `src/components/discovery-card.tsx` | Card for TMDB items (Play if in library, Plus if not) |
| `src/components/discovery-section.tsx` | Horizontal scroll row of discovery cards (reuses MediaSection layout) |
| `src/components/request-sheet.tsx` | Bottom sheet for TV show season request |
| `src/hooks/use-jellyfin-tmdb-map.ts` | Hook to build TMDB→Jellyfin ID cross-reference |
| `src/hooks/use-request-state.ts` | Hook for localStorage-backed request tracking |
| `app/api/riven/stream/[eventType]/route.ts` | Streaming SSE proxy for Riven events (cannot use buffered JSON proxy) |
| `src/actions/request.ts` | Server action to submit requests to Riven (bypasses admin-only proxy) |
| `src/contexts/notifications-context.tsx` | SSE connection to Riven, notification dispatch |
| `src/components/request-complete-toast.tsx` | Custom Sonner toast for completed requests |
| `src/components/notification-bell.tsx` | Sidebar notification indicator |
| `app/(main)/discover/page.tsx` | Discover page |
| `src/components/discover/discover-hero.tsx` | Hero banner for discover page |
| `src/components/discover/genre-filter-bar.tsx` | Sticky genre chip filter |
| `src/components/discover/discover-sections.tsx` | Discover page content orchestrator |

### Modified Files

| File | Change |
|------|--------|
| `src/lib/atoms.ts` | Add discovery atoms (TMDB data, genre list, request state) |
| `app/(main)/page.tsx` | Add discovery rows + "My Requests" section to home |
| `src/components/app-sidebar.tsx` | Add Discover nav link + notification bell |
| `src/components/search-component.tsx` | Add TMDB search results below Jellyfin results |
| `src/components/search-suggestion-item.tsx` | Support TMDB items (poster URL, request action) |
| `app/(main)/layout.tsx` | Wrap with NotificationsProvider |
| `app/(main)/settings/page.tsx` | Add TMDB settings section |
| `next.config.ts` | Add `image.tmdb.org` to `images.remotePatterns` |

---

## Task 1: TMDB Types & Constants

**Files:**
- Create: `src/types/tmdb.ts`
- Create: `src/lib/tmdb.ts`

- [ ] **Step 1: Create TMDB type definitions**

```typescript
// src/types/tmdb.ts

export interface TmdbMovie {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  popularity: number;
  adult: boolean;
  original_language: string;
  media_type?: "movie";
}

export interface TmdbTvShow {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  popularity: number;
  adult: boolean;
  original_language: string;
  origin_country: string[];
  media_type?: "tv";
}

export type TmdbMediaItem = TmdbMovie | TmdbTvShow;

export interface TmdbPaginatedResponse<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

export interface TmdbGenre {
  id: number;
  name: string;
}

export interface TmdbGenreListResponse {
  genres: TmdbGenre[];
}

export interface TmdbExternalIds {
  id: number;
  imdb_id: string | null;
  tvdb_id: number | null;
  wikidata_id: string | null;
  facebook_id: string | null;
  instagram_id: string | null;
  twitter_id: string | null;
}

/** User-facing request state (collapsed from Riven pipeline) */
export type RequestStatus = "requested" | "getting-ready" | "ready" | "failed";

export interface TrackedRequest {
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string | null;
  requestedAt: string; // ISO date
  rivenItemId?: number;
  status: RequestStatus;
  tvdbId?: number; // stored after conversion for TV
}

// Type guards
export function isTmdbMovie(item: TmdbMediaItem): item is TmdbMovie {
  return "title" in item;
}

export function isTmdbTvShow(item: TmdbMediaItem): item is TmdbTvShow {
  return "name" in item;
}

export function getTmdbTitle(item: TmdbMediaItem): string {
  return isTmdbMovie(item) ? item.title : item.name;
}

export function getTmdbYear(item: TmdbMediaItem): string | undefined {
  const date = isTmdbMovie(item) ? item.release_date : item.first_air_date;
  return date ? date.substring(0, 4) : undefined;
}

export function getTmdbMediaType(item: TmdbMediaItem): "movie" | "tv" {
  if (item.media_type) return item.media_type;
  return isTmdbMovie(item) ? "movie" : "tv";
}
```

- [ ] **Step 2: Create TMDB image URL helpers and constants**

```typescript
// src/lib/tmdb.ts

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

export const TMDB_POSTER_SIZES = {
  small: "w185",
  medium: "w342",
  large: "w500",
  original: "original",
} as const;

export const TMDB_BACKDROP_SIZES = {
  small: "w300",
  medium: "w780",
  large: "w1280",
  original: "original",
} as const;

export function tmdbPosterUrl(
  posterPath: string | null,
  size: keyof typeof TMDB_POSTER_SIZES = "medium"
): string | undefined {
  if (!posterPath) return undefined;
  return `${TMDB_IMAGE_BASE}/${TMDB_POSTER_SIZES[size]}${posterPath}`;
}

export function tmdbBackdropUrl(
  backdropPath: string | null,
  size: keyof typeof TMDB_BACKDROP_SIZES = "large"
): string | undefined {
  if (!backdropPath) return undefined;
  return `${TMDB_IMAGE_BASE}/${TMDB_BACKDROP_SIZES[size]}${backdropPath}`;
}

/** Collapse Riven pipeline states into user-facing states */
export function rivenStateToRequestStatus(
  rivenState: string
): RequestStatus {
  switch (rivenState) {
    case "Requested":
    case "Indexed":
      return "requested";
    case "Scraped":
    case "Downloaded":
    case "Symlinked":
      return "getting-ready";
    case "Completed":
    case "PartiallyCompleted":
      return "ready";
    case "Failed":
      return "failed";
    default:
      return "requested";
  }
}

// Re-export types used with these helpers
export type { RequestStatus } from "@/src/types/tmdb";
```

- [ ] **Step 3: Commit**

```bash
git add src/types/tmdb.ts src/lib/tmdb.ts
git commit -m "feat: add TMDB types, image helpers, and request state types"
```

---

## Task 2: TMDB API Proxy & Config Storage

**Files:**
- Create: `app/api/tmdb/[...slug]/route.ts`
- Create: `app/api/config/tmdb/route.ts`
- Modify: `src/actions/store/server-actions.ts`

- [ ] **Step 1: Add TMDB config storage to server actions**

Add to `src/actions/store/server-actions.ts` (after the Riven config section):

```typescript
// --- TMDB config ---
const TMDB_CONFIG_KEY = "tmdb-config";

export interface TmdbConfig {
  apiKey: string;
}

export async function setTmdbConfig(value: TmdbConfig) {
  const cookieStore = await cookies();
  cookieStore.set(TMDB_CONFIG_KEY, JSON.stringify(value), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function getTmdbConfig(): Promise<TmdbConfig | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(TMDB_CONFIG_KEY);
  if (!raw?.value) return null;
  try {
    return JSON.parse(raw.value);
  } catch {
    return null;
  }
}

export async function removeTmdbConfig() {
  const cookieStore = await cookies();
  cookieStore.delete(TMDB_CONFIG_KEY);
}
```

- [ ] **Step 2: Create TMDB API proxy route**

```typescript
// app/api/tmdb/[...slug]/route.ts
import { getTmdbConfig } from "@/src/actions/store/server-actions";
import { NextRequest, NextResponse } from "next/server";

const TMDB_BASE = "https://api.themoviedb.org/3";

async function resolveTmdbApiKey(): Promise<string | null> {
  const cookieConfig = await getTmdbConfig();
  if (cookieConfig?.apiKey) return cookieConfig.apiKey;
  return process.env.TMDB_API_KEY || null;
}

async function handleTmdbProxy(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const apiKey = await resolveTmdbApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { success: false, message: "TMDB not configured" },
      { status: 503 }
    );
  }

  const { slug } = await params;
  const path = slug.join("/");
  const searchParams = new URL(request.url).searchParams;
  searchParams.set("api_key", apiKey);

  const targetUrl = `${TMDB_BASE}/${path}?${searchParams.toString()}`;

  try {
    const response = await fetch(targetUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "TMDB request failed";
    return NextResponse.json(
      { success: false, message },
      { status: 502 }
    );
  }
}

export const GET = handleTmdbProxy;
```

- [ ] **Step 3: Create TMDB config check endpoint**

```typescript
// app/api/config/tmdb/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    hasEnvConfig: Boolean(process.env.TMDB_API_KEY),
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/tmdb/ app/api/config/tmdb/ src/actions/store/server-actions.ts
git commit -m "feat: add TMDB API proxy route and config storage"
```

---

## Task 3: TMDB Server Actions

**Files:**
- Create: `src/actions/tmdb.ts`

- [ ] **Step 1: Create TMDB data-fetching actions**

```typescript
// src/actions/tmdb.ts
"use server";

import { getTmdbConfig } from "./store/server-actions";
import type {
  TmdbMovie,
  TmdbTvShow,
  TmdbMediaItem,
  TmdbPaginatedResponse,
  TmdbGenre,
  TmdbGenreListResponse,
  TmdbExternalIds,
} from "@/src/types/tmdb";

const TMDB_BASE = "https://api.themoviedb.org/3";

async function resolveTmdbApiKey(): Promise<string | null> {
  const cookieConfig = await getTmdbConfig();
  if (cookieConfig?.apiKey) return cookieConfig.apiKey;
  return process.env.TMDB_API_KEY || null;
}

async function tmdbFetch<T>(path: string, params?: Record<string, string>): Promise<T | null> {
  const apiKey = await resolveTmdbApiKey();
  if (!apiKey) return null;

  const searchParams = new URLSearchParams({ api_key: apiKey, language: "en-US", ...params });
  const response = await fetch(`${TMDB_BASE}${path}?${searchParams}`, {
    signal: AbortSignal.timeout(10000),
    next: { revalidate: 600 }, // cache 10 minutes
  });

  if (!response.ok) return null;
  return response.json();
}

export async function fetchTrendingMovies(
  timeWindow: "day" | "week" = "week"
): Promise<TmdbMovie[]> {
  const data = await tmdbFetch<TmdbPaginatedResponse<TmdbMovie>>(
    `/trending/movie/${timeWindow}`
  );
  return data?.results ?? [];
}

export async function fetchTrendingTv(
  timeWindow: "day" | "week" = "week"
): Promise<TmdbTvShow[]> {
  const data = await tmdbFetch<TmdbPaginatedResponse<TmdbTvShow>>(
    `/trending/tv/${timeWindow}`
  );
  return data?.results ?? [];
}

export async function fetchPopularMovies(): Promise<TmdbMovie[]> {
  const data = await tmdbFetch<TmdbPaginatedResponse<TmdbMovie>>("/movie/popular");
  return data?.results ?? [];
}

export async function fetchPopularTv(): Promise<TmdbTvShow[]> {
  const data = await tmdbFetch<TmdbPaginatedResponse<TmdbTvShow>>("/tv/popular");
  return data?.results ?? [];
}

export async function fetchTopRatedMovies(): Promise<TmdbMovie[]> {
  const data = await tmdbFetch<TmdbPaginatedResponse<TmdbMovie>>("/movie/top_rated");
  return data?.results ?? [];
}

export async function fetchTopRatedTv(): Promise<TmdbTvShow[]> {
  const data = await tmdbFetch<TmdbPaginatedResponse<TmdbTvShow>>("/tv/top_rated");
  return data?.results ?? [];
}

export async function searchTmdb(query: string): Promise<TmdbMediaItem[]> {
  if (!query || query.length < 2) return [];
  const data = await tmdbFetch<TmdbPaginatedResponse<TmdbMediaItem>>("/search/multi", {
    query,
    include_adult: "false",
  });
  // Filter to movies and TV only (exclude people — Person results also have `name`)
  return (data?.results ?? []).filter(
    (item: any) => item.media_type === "movie" || item.media_type === "tv"
  );
}

export async function fetchMovieGenres(): Promise<TmdbGenre[]> {
  const data = await tmdbFetch<TmdbGenreListResponse>("/genre/movie/list");
  return data?.genres ?? [];
}

export async function fetchTvGenres(): Promise<TmdbGenre[]> {
  const data = await tmdbFetch<TmdbGenreListResponse>("/genre/tv/list");
  return data?.genres ?? [];
}

export async function fetchDiscoverMovies(
  genreId?: number,
  page: number = 1
): Promise<TmdbPaginatedResponse<TmdbMovie> | null> {
  const params: Record<string, string> = { page: String(page), sort_by: "popularity.desc" };
  if (genreId) params.with_genres = String(genreId);
  return tmdbFetch<TmdbPaginatedResponse<TmdbMovie>>("/discover/movie", params);
}

export async function fetchDiscoverTv(
  genreId?: number,
  page: number = 1
): Promise<TmdbPaginatedResponse<TmdbTvShow> | null> {
  const params: Record<string, string> = { page: String(page), sort_by: "popularity.desc" };
  if (genreId) params.with_genres = String(genreId);
  return tmdbFetch<TmdbPaginatedResponse<TmdbTvShow>>("/discover/tv", params);
}

export async function fetchTvExternalIds(tmdbId: number): Promise<TmdbExternalIds | null> {
  return tmdbFetch<TmdbExternalIds>(`/tv/${tmdbId}/external_ids`);
}

export async function isTmdbConfigured(): Promise<boolean> {
  const apiKey = await resolveTmdbApiKey();
  return apiKey !== null;
}
```

- [ ] **Step 2: Export new actions from barrel**

Add to `src/actions/index.ts`:
```typescript
export { isTmdbConfigured } from "./tmdb";
```

- [ ] **Step 3: Commit**

```bash
git add src/actions/tmdb.ts src/actions/index.ts
git commit -m "feat: add TMDB server actions for discovery, search, and genres"
```

---

## Task 4: TMDB Admin Settings UI

**Files:**
- Create: `src/components/settings/tmdb-section.tsx`
- Modify: `app/(main)/settings/page.tsx`

- [ ] **Step 1: Create TMDB settings section component**

Model after the existing `src/components/settings/riven-section.tsx` pattern. Admin-only visibility. Fields: API Key (password input). Actions: Test & Save, Disconnect. Shows env config hint if `TMDB_API_KEY` env var is set.

Test connection by calling `/api/tmdb/configuration` — if it returns 200, the key is valid.

- [ ] **Step 2: Add TmdbSection to settings page**

Import and render `TmdbSection` in `app/(main)/settings/page.tsx`, below the RivenSection. The admin check is handled internally by the component (same pattern as `RivenSection`), not at the page level.

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/tmdb-section.tsx app/(main)/settings/page.tsx
git commit -m "feat: add TMDB API key admin settings UI"
```

---

## Task 5: Jellyfin ↔ TMDB Cross-Reference

**Files:**
- Create: `src/hooks/use-jellyfin-tmdb-map.ts`
- Modify: `src/lib/atoms.ts`

- [ ] **Step 1: Add discovery-related atoms**

Add to `src/lib/atoms.ts`:

```typescript
// TMDB → Jellyfin cross-reference: Map<tmdbId, { jellyfinId, type }>
export const jellyfinTmdbMapAtom = atom<Map<number, { jellyfinId: string; type: string }>>(new Map());
export const jellyfinTmdbMapLoadedAtom = atom(false);
```

- [ ] **Step 2: Create the cross-reference hook**

```typescript
// src/hooks/use-jellyfin-tmdb-map.ts
"use client";

import { useEffect } from "react";
import { useAtom } from "jotai";
import { jellyfinTmdbMapAtom, jellyfinTmdbMapLoadedAtom } from "@/src/lib/atoms";
import { fetchAllLibraryTmdbIds } from "@/src/actions/media";

export function useJellyfinTmdbMap() {
  const [tmdbMap, setTmdbMap] = useAtom(jellyfinTmdbMapAtom);
  const [loaded, setLoaded] = useAtom(jellyfinTmdbMapLoadedAtom);

  useEffect(() => {
    if (loaded) return;

    async function buildMap() {
      try {
        const entries = await fetchAllLibraryTmdbIds();
        const map = new Map<number, { jellyfinId: string; type: string }>();
        for (const entry of entries) {
          if (entry.tmdbId) {
            map.set(entry.tmdbId, { jellyfinId: entry.jellyfinId, type: entry.type });
          }
        }
        setTmdbMap(map);
        setLoaded(true);
      } catch (error) {
        console.error("Failed to build TMDB map:", error);
      }
    }

    buildMap();
  }, [loaded, setTmdbMap, setLoaded]);

  return { tmdbMap, loaded };
}
```

- [ ] **Step 3: Add `fetchAllLibraryTmdbIds` server action**

Add to `src/actions/media.ts`:

```typescript
// Follows the same auth pattern as every other function in media.ts
export async function fetchAllLibraryTmdbIds(): Promise<
  { tmdbId: number; jellyfinId: string; type: string }[]
> {
  const { serverUrl, user } = await getAuthData(); // returns JellyfinUserWithToken
  const jellyfin = createJellyfinInstance();
  const api = jellyfin.createApi(serverUrl);
  api.accessToken = user.AccessToken;
  const itemsApi = getItemsApi(api);

  const results: { tmdbId: number; jellyfinId: string; type: string }[] = [];

  // Fetch movies and series with provider IDs
  for (const itemType of ["Movie", "Series"] as const) {
    const response = await itemsApi.getItems({
      userId: user.Id, // JellyfinUserWithToken.Id (NOT user.User.Id)
      includeItemTypes: [itemType as any],
      recursive: true,
      fields: ["ProviderIds"] as any,
      limit: 10000,
    });

    for (const item of response.data.Items ?? []) {
      const tmdbIdStr = item.ProviderIds?.Tmdb;
      if (tmdbIdStr && item.Id) {
        const tmdbId = parseInt(tmdbIdStr, 10);
        if (!isNaN(tmdbId)) {
          results.push({ tmdbId, jellyfinId: item.Id, type: itemType });
        }
      }
    }
  }

  return results;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/use-jellyfin-tmdb-map.ts src/lib/atoms.ts src/actions/media.ts
git commit -m "feat: add Jellyfin-to-TMDB cross-reference map for library matching"
```

---

## Task 6: Request State Tracking

**Files:**
- Create: `src/hooks/use-request-state.ts`

- [ ] **Step 1: Create request tracking hook with localStorage**

```typescript
// src/hooks/use-request-state.ts
"use client";

import { useState, useCallback, useEffect } from "react";
import type { TrackedRequest, RequestStatus } from "@/src/types/tmdb";

const STORAGE_KEY = "fable-requests";

function loadRequests(): TrackedRequest[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRequests(requests: TrackedRequest[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(requests));
}

export function useRequestState() {
  const [requests, setRequests] = useState<TrackedRequest[]>(loadRequests);

  // Sync to localStorage on change
  useEffect(() => {
    saveRequests(requests);
  }, [requests]);

  const addRequest = useCallback((request: TrackedRequest) => {
    setRequests((prev) => {
      // Deduplicate by tmdbId + mediaType
      const filtered = prev.filter(
        (r) => !(r.tmdbId === request.tmdbId && r.mediaType === request.mediaType)
      );
      return [request, ...filtered];
    });
  }, []);

  const updateRequestStatus = useCallback(
    (tmdbId: number, status: RequestStatus, rivenItemId?: number) => {
      setRequests((prev) =>
        prev.map((r) =>
          r.tmdbId === tmdbId
            ? { ...r, status, ...(rivenItemId !== undefined ? { rivenItemId } : {}) }
            : r
        )
      );
    },
    []
  );

  const removeRequest = useCallback((tmdbId: number) => {
    setRequests((prev) => prev.filter((r) => r.tmdbId !== tmdbId));
  }, []);

  const getRequestByTmdbId = useCallback(
    (tmdbId: number): TrackedRequest | undefined => {
      return requests.find((r) => r.tmdbId === tmdbId);
    },
    [requests]
  );

  const activeRequests = requests.filter(
    (r) => r.status !== "ready" && r.status !== "failed"
  );

  // Clean up "ready" requests older than 24 hours
  useEffect(() => {
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    setRequests((prev) =>
      prev.filter(
        (r) =>
          r.status !== "ready" ||
          new Date(r.requestedAt).getTime() > dayAgo
      )
    );
  }, []);

  return {
    requests,
    activeRequests,
    addRequest,
    updateRequestStatus,
    removeRequest,
    getRequestByTmdbId,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-request-state.ts
git commit -m "feat: add localStorage-backed request state tracking hook"
```

---

## Task 7: Discovery Card Component

**Files:**
- Create: `src/components/discovery-card.tsx`

- [ ] **Step 1: Create the discovery card**

This card renders a TMDB item. It mirrors `MediaCard` dimensions (`w-36`, `aspect-[2/3]`). Behavior:
- If item exists in Jellyfin (via tmdbMap), card links to `/movie/{jellyfinId}` or `/series/{jellyfinId}` with a Play icon on hover.
- If item is NOT in Jellyfin but has been requested, card shows request state badge.
- If item is NOT in Jellyfin and NOT requested, card shows a Plus icon on hover.

Clicking Plus on a movie: fires request immediately, shows toast.
Clicking Plus on a TV show: opens the request sheet (Task 8).

Props:
```typescript
interface DiscoveryCardProps {
  item: TmdbMediaItem;
  jellyfinMatch?: { jellyfinId: string; type: string };
  trackedRequest?: TrackedRequest;
  onRequestMovie: (item: TmdbMovie) => void;
  onRequestTvShow: (item: TmdbTvShow) => void;
}
```

Uses `OptimizedImage` for the poster with TMDB URL from `tmdbPosterUrl(item.poster_path, "medium")`. Badge system:
- Request state badges: sky-500/70 for "Requested", amber-500/70 for "Getting Ready", emerald-500/70 for "Ready"
- Media type badge: top-left, same style as old SeerrCard (`bg-black/60 text-white border-white/20`)

- [ ] **Step 2: Commit**

```bash
git add src/components/discovery-card.tsx
git commit -m "feat: add discovery card component with library matching and request states"
```

---

## Task 8: Request Server Action

**Files:**
- Create: `src/actions/request.ts`

**Why a server action instead of the Riven proxy:** The Riven proxy (`/api/riven/[...slug]`) restricts all POST/PUT/DELETE to admin users. Content requesting should be available to all authenticated users. A dedicated server action calls Riven directly server-side, bypassing the admin-gated proxy.

- [ ] **Step 1: Create request server action**

```typescript
// src/actions/request.ts
"use server";

import { resolveRivenConfig } from "./riven";
import { fetchTvExternalIds } from "./tmdb";

interface RequestResult {
  success: boolean;
  message: string;
  tvdbId?: number;
}

export async function requestMovie(tmdbId: number): Promise<RequestResult> {
  const config = await resolveRivenConfig();
  if (!config) return { success: false, message: "Riven is not configured" };

  try {
    const response = await fetch(
      `${config.apiUrl.replace(/\/+$/, "")}/api/v1/items/add`,
      {
        method: "POST",
        headers: {
          "x-api-key": config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          media_type: "movie",
          tmdb_ids: [String(tmdbId)],
        }),
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return { success: false, message: data.message || `Riven returned ${response.status}` };
    }

    return { success: true, message: "Movie requested" };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Request failed" };
  }
}

export async function requestTvShow(tmdbId: number): Promise<RequestResult> {
  const config = await resolveRivenConfig();
  if (!config) return { success: false, message: "Riven is not configured" };

  // Convert TMDB ID to TVDB ID (Riven requires TVDB for TV shows)
  const externalIds = await fetchTvExternalIds(tmdbId);
  if (!externalIds?.tvdb_id) {
    return { success: false, message: "Could not find TVDB ID for this show" };
  }

  try {
    const response = await fetch(
      `${config.apiUrl.replace(/\/+$/, "")}/api/v1/items/add`,
      {
        method: "POST",
        headers: {
          "x-api-key": config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          media_type: "tv",
          tvdb_ids: [String(externalIds.tvdb_id)],
        }),
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return { success: false, message: data.message || `Riven returned ${response.status}` };
    }

    return { success: true, message: "TV show requested", tvdbId: externalIds.tvdb_id };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Request failed" };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/actions/request.ts
git commit -m "feat: add request server actions (bypasses admin-only proxy for all users)"
```

---

## Task 9: Request Sheet (TV Shows)

**Files:**
- Create: `src/components/request-sheet.tsx`

- [ ] **Step 1: Create the TV request bottom sheet**

Uses Radix `Sheet` component (side="bottom"). Shows:
- Poster thumbnail + title + year
- "Request all seasons" toggle (default: on)
- Submit button

On submit:
1. Call `requestTvShow(tmdbId)` server action (handles TVDB conversion internally)
2. Add to tracked requests via `useRequestState.addRequest()`
3. Show success toast
4. Close sheet

```typescript
interface RequestSheetProps {
  item: TmdbTvShow | null;
  isOpen: boolean;
  onClose: () => void;
  onRequestSubmitted: (request: TrackedRequest) => void;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/request-sheet.tsx
git commit -m "feat: add TV show request bottom sheet with TVDB ID conversion"
```

---

## Task 9: Discovery Sections on Home Page

**Files:**
- Create: `src/components/discovery-section.tsx`
- Modify: `app/(main)/page.tsx`
- Modify: `src/lib/atoms.ts`

- [ ] **Step 1: Create discovery section component**

Reuses the horizontal scroll layout from `MediaSection` but renders `DiscoveryCard` instead of `MediaCard`. Props:

```typescript
interface DiscoverySectionProps {
  sectionName: string;
  items: TmdbMediaItem[];
  icon?: React.ReactNode; // e.g. TrendingUp, Flame from lucide
}
```

Internally uses `useJellyfinTmdbMap()` and `useRequestState()` to determine card state. Handles movie request (inline) and TV request (opens sheet).

- [ ] **Step 2: Add discovery atoms**

Add to `src/lib/atoms.ts`:

```typescript
export const homeTrendingAtom = atom<TmdbMediaItem[]>([]);
export const homePopularMoviesAtom = atom<TmdbMovie[]>([]);
export const homePopularTvAtom = atom<TmdbTvShow[]>([]);
export const discoveryLastFetchedAtom = atom(0);
```

- [ ] **Step 3: Integrate discovery rows into home page**

Modify `app/(main)/page.tsx`:
- Import `fetchTrendingMovies`, `fetchTrendingTv`, `fetchPopularMovies`, `fetchPopularTv`
- In `fetchData()`, after fetching Jellyfin data, also fetch TMDB data in parallel (gated on `isTmdbConfigured()`)
- Store in discovery atoms with same 60-second cache pattern
- Render order: Continue Watching → Next Up → **My Requests** (if any) → **Trending This Week** → first library → **Popular Movies** → remaining libraries

The discovery sections only render if TMDB is configured and returned data.

- [ ] **Step 4: Commit**

```bash
git add src/components/discovery-section.tsx src/lib/atoms.ts app/(main)/page.tsx
git commit -m "feat: add TMDB discovery rows to home page (trending, popular)"
```

---

## Task 10: Riven SSE Streaming Proxy

**Files:**
- Create: `app/api/riven/stream/[eventType]/route.ts`

**Why a separate route:** The existing Riven proxy at `/api/riven/[...slug]` buffers the entire response via `await response.json()` and returns `NextResponse.json()`. SSE requires streaming the response body as a long-lived connection. The proxy also sets `AbortSignal.timeout(15000)` which would kill SSE after 15 seconds. This dedicated route uses `ReadableStream` to pipe the upstream SSE connection through to the client.

- [ ] **Step 1: Create SSE streaming proxy**

```typescript
// app/api/riven/stream/[eventType]/route.ts
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
```

- [ ] **Step 2: Commit**

```bash
git add app/api/riven/stream/
git commit -m "feat: add streaming SSE proxy for Riven real-time events"
```

---

## Task 11: Notifications Context

**Files:**
- Create: `src/contexts/notifications-context.tsx`
- Modify: `app/(main)/layout.tsx`

- [ ] **Step 1: Create notifications provider with SSE**

```typescript
// src/contexts/notifications-context.tsx
"use client";

import { createContext, useContext, useEffect, useRef, useCallback, useState } from "react";
import type { RequestStatus } from "@/src/types/tmdb";
import { rivenStateToRequestStatus } from "@/src/lib/tmdb";
import { useRiven } from "@/src/contexts/riven-context";

interface Notification {
  id: string;
  title: string;
  type: "movie" | "show";
  tmdbId?: string;
  timestamp: string;
  read: boolean;
}

interface NotificationsContextType {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllRead: () => void;
  onItemStateChange: (callback: ItemStateCallback) => () => void;
}

type ItemStateCallback = (data: {
  itemId: number;
  tmdbId?: string;
  tvdbId?: string;
  newState: string;
  requestStatus: RequestStatus;
}) => void;

const NotificationsContext = createContext<NotificationsContextType | null>(null);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { isConnected } = useRiven();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const itemStateCallbacksRef = useRef<Set<ItemStateCallback>>(new Set());
  const eventSourcesRef = useRef<EventSource[]>([]);

  // Subscribe to item_update SSE
  useEffect(() => {
    if (!isConnected) return;

    // Uses the dedicated SSE streaming proxy (Task 10), NOT the buffered JSON proxy
    const itemUpdateSource = new EventSource("/api/riven/stream/item_update");
    const notificationsSource = new EventSource("/api/riven/stream/notifications");

    itemUpdateSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const requestStatus = rivenStateToRequestStatus(data.new_state);
        for (const callback of itemStateCallbacksRef.current) {
          callback({
            itemId: data.item_id,
            tmdbId: data.tmdb_id,
            tvdbId: data.tvdb_id,
            newState: data.new_state,
            requestStatus,
          });
        }
      } catch { /* ignore parse errors from keepalives */ }
    };

    notificationsSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const notification: Notification = {
          id: `${data.imdb_id}-${Date.now()}`,
          title: data.title,
          type: data.type,
          tmdbId: data.tmdb_id,
          timestamp: data.timestamp || new Date().toISOString(),
          read: false,
        };
        setNotifications((prev) => [notification, ...prev].slice(0, 50));
      } catch { /* ignore parse errors from keepalives */ }
    };

    eventSourcesRef.current = [itemUpdateSource, notificationsSource];

    return () => {
      itemUpdateSource.close();
      notificationsSource.close();
      eventSourcesRef.current = [];
    };
  }, [isConnected]);

  const onItemStateChange = useCallback((callback: ItemStateCallback) => {
    itemStateCallbacksRef.current.add(callback);
    return () => { itemStateCallbacksRef.current.delete(callback); };
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationsContext.Provider
      value={{ notifications, unreadCount, markAsRead, markAllRead, onItemStateChange }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) throw new Error("useNotifications must be used within NotificationsProvider");
  return context;
}
```

- [ ] **Step 2: Wrap layout with NotificationsProvider**

In `app/(main)/layout.tsx`, add `NotificationsProvider` inside `RivenProvider`:

```tsx
<RivenProvider>
  <NotificationsProvider>
    {/* existing children */}
  </NotificationsProvider>
</RivenProvider>
```

- [ ] **Step 3: Commit**

```bash
git add src/contexts/notifications-context.tsx app/(main)/layout.tsx
git commit -m "feat: add notifications context with Riven SSE for real-time request tracking"
```

---

## Task 11: Request Complete Toast & Notification Bell

**Files:**
- Create: `src/components/request-complete-toast.tsx`
- Create: `src/components/notification-bell.tsx`
- Modify: `src/components/app-sidebar.tsx`

- [ ] **Step 1: Create custom completion toast**

```typescript
// src/components/request-complete-toast.tsx
import { Button } from "./ui/button";
import { OptimizedImage } from "./optimized-image";
import { tmdbPosterUrl } from "@/src/lib/tmdb";
import Link from "next/link";

interface RequestCompleteToastProps {
  title: string;
  year?: number;
  posterPath: string | null;
  jellyfinId?: string;
  mediaType: "movie" | "show";
  onDismiss: () => void;
}

export function RequestCompleteToast({
  title, year, posterPath, jellyfinId, mediaType, onDismiss,
}: RequestCompleteToastProps) {
  const detailPath = jellyfinId
    ? (mediaType === "movie" ? `/movie/${jellyfinId}` : `/series/${jellyfinId}`)
    : undefined;

  return (
    <div className="flex items-center gap-3 w-full">
      {posterPath && (
        <OptimizedImage
          src={tmdbPosterUrl(posterPath, "small") ?? ""}
          alt={title}
          className="w-10 h-15 rounded-md object-cover shrink-0"
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{title}</p>
        <p className="text-xs text-muted-foreground">
          {year ? `${year} · ` : ""}Ready to watch
        </p>
      </div>
      {detailPath && (
        <Button size="sm" asChild onClick={onDismiss}>
          <Link href={detailPath}>Watch</Link>
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create notification bell for sidebar**

Small bell icon component that shows unread count dot. Clicking opens a `Popover` with recent notifications. Uses `useNotifications()`.

- [ ] **Step 3: Add notification bell + Discover link to sidebar**

In `src/components/app-sidebar.tsx`:
- Add `Compass` icon import back from lucide-react
- Add Discover nav link (`/discover`) between Home and Libraries
- Add `NotificationBell` component in the sidebar footer, before the user dropdown

- [ ] **Step 4: Commit**

```bash
git add src/components/request-complete-toast.tsx src/components/notification-bell.tsx src/components/app-sidebar.tsx
git commit -m "feat: add completion toast, notification bell, and Discover nav link"
```

---

## Task 12: Search Enhancement

**Files:**
- Modify: `src/components/search-component.tsx`

- [ ] **Step 1: Add TMDB results to search**

Modify `SearchBar` in `src/components/search-component.tsx`:
- Add state: `tmdbSuggestions` (TmdbMediaItem[])
- When query changes (debounced), also call `searchTmdb(query)` in parallel with `searchItems(query)`
- Gate on `useRiven().isConnected` — only show TMDB results if Riven is connected (so users can actually request)
- Deduplicate: filter out TMDB items whose IDs exist in the Jellyfin TMDB map
- Render TMDB results below Jellyfin results with a separator: "Not in your library" header in `text-xs text-muted-foreground`
- TMDB suggestion items show TMDB poster URL and media type badge
- Clicking a TMDB movie result fires a request immediately + toast
- Clicking a TMDB TV result opens the request sheet
- If zero Jellyfin results but TMDB has results, show TMDB results as primary section

- [ ] **Step 2: Commit**

```bash
git add src/components/search-component.tsx
git commit -m "feat: add TMDB results to search with request action"
```

---

## Task 13: Discover Page

**Files:**
- Create: `app/(main)/discover/page.tsx`
- Create: `src/components/discover/discover-hero.tsx`
- Create: `src/components/discover/genre-filter-bar.tsx`
- Create: `src/components/discover/discover-sections.tsx`

- [ ] **Step 1: Create discover hero component**

Full-bleed backdrop from the #1 trending item. Shows title, overview (truncated), TMDB rating, and action button (Watch Now if in library, Add to Library if not). Uses `tmdbBackdropUrl(item.backdrop_path, "large")`.

- [ ] **Step 2: Create genre filter bar**

Horizontal scrollable bar of genre chips. Uses `fetchMovieGenres()` + `fetchTvGenres()` merged and deduplicated. Sticky positioning below the hero. Selecting a genre filters all sections via `fetchDiscoverMovies(genreId)` / `fetchDiscoverTv(genreId)`.

- [ ] **Step 3: Create discover sections orchestrator**

Fetches and renders all discovery rows: Trending Now, Popular Movies, Popular TV Shows, Top Rated. When a genre filter is active, replaces rows with genre-specific results. Uses `DiscoverySection` component for each row.

- [ ] **Step 4: Create discover page**

```typescript
// app/(main)/discover/page.tsx
"use client";

import { AuroraBackground } from "@/src/components/aurora-background";
import { SearchBar } from "@/src/components/search-component";
import { DiscoverHero } from "@/src/components/discover/discover-hero";
import { GenreFilterBar } from "@/src/components/discover/genre-filter-bar";
import { DiscoverSections } from "@/src/components/discover/discover-sections";

export default function DiscoverPage() {
  return (
    <div className="relative px-4 py-3 max-w-full overflow-hidden min-h-[calc(100vh-4rem)]">
      <AuroraBackground />
      <div className="relative z-[99] mb-8 animate-in fade-in duration-500">
        <div className="mb-6">
          <SearchBar />
        </div>
        <DiscoverHero />
        <GenreFilterBar />
        <DiscoverSections />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add app/(main)/discover/ src/components/discover/
git commit -m "feat: add discover page with hero, genre filters, and discovery sections"
```

---

## Task 14: My Requests Section on Home

**Files:**
- Modify: `app/(main)/page.tsx`

- [ ] **Step 1: Add "My Requests" section to home page**

Between Next Up and the first discovery row, render a section showing active tracked requests. Uses `useRequestState().activeRequests`. Each card is a `DiscoveryCard` with its tracked request state. Section only renders when `activeRequests.length > 0`.

Wire up the `NotificationsProvider` SSE callbacks to update request state:
- Listen to `onItemStateChange` events
- Match incoming `tmdb_id` to tracked requests
- Call `updateRequestStatus()` with the new status
- When status becomes "ready", fire the custom completion toast via Sonner

- [ ] **Step 2: Commit**

```bash
git add app/(main)/page.tsx
git commit -m "feat: add My Requests section to home page with live status updates"
```

---

## Task 15: Reconcile Request State on Load

**Files:**
- Modify: `app/(main)/page.tsx` or create `src/hooks/use-reconcile-requests.ts`

- [ ] **Step 1: Reconcile tracked requests against Riven + Jellyfin on page load**

On home page mount (after initial data fetch), for each tracked request:
1. Query Riven: `GET /api/riven/items?search=tmdb_{tmdbId}` (uses the search prefix syntax documented in Riven API)
2. Check Riven's reported state, update local tracked request status via `rivenStateToRequestStatus()`
3. Cross-reference with Jellyfin TMDB map — if item now exists in Jellyfin, mark as "ready"
4. Remove requests for items that Riven reports as nonexistent (user may have deleted them)

This ensures state is correct even if the user was offline when SSE events fired.

- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-reconcile-requests.ts app/(main)/page.tsx
git commit -m "feat: reconcile tracked request state against Riven and Jellyfin on load"
```

---

## Task 16: Next.js Image Domain Config

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: Add TMDB image domain to remote patterns**

```typescript
// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
        pathname: "/t/p/**",
      },
    ],
  },
};

export default nextConfig;
```

Note: If `OptimizedImage` uses a raw `<img>` tag (not Next.js `<Image>`), this step may be unnecessary. Check during implementation.

- [ ] **Step 2: Commit**

```bash
git add next.config.ts
git commit -m "feat: add TMDB image domain to Next.js config"
```

---

## Dependency Graph

```
Task 1 (types/constants)
  → Task 2 (proxy/config) + Task 16 (next.config)
  → Task 3 (server actions)
    → Task 4 (admin settings)
    → Task 5 (Jellyfin cross-ref)
    → Task 6 (request state hook)
      → Task 7 (discovery card)
        → Task 8 (request server action)
          → Task 9 (request sheet)
          → Task 12 (home page integration)
            → Task 15 (my requests on home)
            → Task 16 (reconcile on load)
      → Task 10 (SSE streaming proxy)
        → Task 11 (notifications context)
          → Task 13 (toast/bell)
      → Task 14 (search enhancement)
    → Task 15 (discover page — depends on Task 12 for DiscoverySection)
```

Tasks 4, 5, 6, 16 can run in parallel after Task 3. Tasks 10 and 14 can run in parallel.

---

## Testing Strategy

- **TMDB proxy:** Verify key injection, 503 when unconfigured, 502 on timeout
- **Server actions:** Verify response parsing, empty array on failure, genre merging
- **Cross-reference:** Verify Map building from Jellyfin ProviderIds
- **Request flow:** Verify TVDB conversion for TV, localStorage persistence, deduplication, server action bypasses admin gate
- **SSE streaming proxy:** Verify long-lived connection stays open, events pipe through, no timeout
- **SSE:** Verify event parsing, callback dispatch, state collapse
- **UI:** Visual verification — discovery cards match library cards, request states display correctly, sheet opens for TV, toast fires on completion
- **Graceful degradation:** Discover page shows "Configure TMDB in Settings" message when TMDB not configured

For visual UI verification: run `bun dev` and test against a live Jellyfin + Riven instance.

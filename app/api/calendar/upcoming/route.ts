import { NextResponse } from "next/server";
import { fetchAllLibraryTmdbIds } from "@/src/actions/media";
import { getTmdbConfig } from "@/src/actions/store/server-actions";

const TMDB_BASE = "https://api.themoviedb.org/3";

// How wide a window to populate around "now". Recent past gives the user a
// sense of what just aired; the future window is the actual "what's coming."
const WINDOW_PAST_DAYS = 14;
const WINDOW_FUTURE_DAYS = 60;

// Concurrent TMDB calls — keep modest to avoid rate-limit hits with a large library.
const TMDB_CONCURRENCY = 5;

interface TmdbEpisodeStub {
  air_date?: string | null;
  episode_number?: number | null;
  season_number?: number | null;
}

interface TmdbTvSummary {
  name?: string;
  next_episode_to_air?: TmdbEpisodeStub | null;
  last_episode_to_air?: TmdbEpisodeStub | null;
  status?: string;
}

interface CalendarItem {
  item_id: number;
  tmdb_id: string | null;
  tvdb_id: string | null;
  show_title: string;
  item_type: "episode" | "movie";
  aired_at: string;
  season: number | null;
  episode: number | null;
  last_state: string | null;
}

async function resolveTmdbApiKey(): Promise<string | null> {
  const cookieConfig = await getTmdbConfig();
  if (cookieConfig?.apiKey) return cookieConfig.apiKey;
  return process.env.TMDB_API_KEY || null;
}

async function pmap<T, U>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<U>,
): Promise<U[]> {
  const results: U[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

function buildEpisodeItem(
  show: TmdbTvSummary,
  episode: TmdbEpisodeStub | null | undefined,
  entry: { tmdbId: number; tvdbId: number | null },
): CalendarItem | null {
  if (!episode?.air_date || episode.season_number == null || episode.episode_number == null) {
    return null;
  }

  return {
    item_id:
      entry.tmdbId * 1_000_000 +
      (episode.season_number ?? 0) * 1000 +
      (episode.episode_number ?? 0),
    tmdb_id: String(entry.tmdbId),
    tvdb_id: entry.tvdbId != null ? String(entry.tvdbId) : null,
    show_title: show.name ?? "Unknown",
    item_type: "episode",
    aired_at: `${episode.air_date}T00:00:00.000Z`,
    season: episode.season_number,
    episode: episode.episode_number,
    last_state: null,
  };
}

export async function GET(): Promise<NextResponse> {
  const apiKey = await resolveTmdbApiKey();
  if (!apiKey) {
    return NextResponse.json({ items: [] });
  }

  let library: Awaited<ReturnType<typeof fetchAllLibraryTmdbIds>>;
  try {
    library = await fetchAllLibraryTmdbIds();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Library unreachable";
    console.error(`[calendar/upcoming] ${message}`);
    return NextResponse.json({ items: [] });
  }

  const now = Date.now();
  const lowerBound = now - WINDOW_PAST_DAYS * 86_400_000;
  const upperBound = now + WINDOW_FUTURE_DAYS * 86_400_000;

  const seriesEntries = library.filter(
    (entry) => entry.type === "Series" && entry.tmdbId > 0,
  );

  const itemsPerShow = await pmap(seriesEntries, TMDB_CONCURRENCY, async (entry) => {
    try {
      const url = `${TMDB_BASE}/tv/${entry.tmdbId}?api_key=${apiKey}&language=en-US`;
      const response = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        next: { revalidate: 1800 },
      });
      if (!response.ok) return [] as CalendarItem[];

      const show = (await response.json()) as TmdbTvSummary;
      const candidates = [show.next_episode_to_air, show.last_episode_to_air]
        .map((ep) => buildEpisodeItem(show, ep, entry))
        .filter((item): item is CalendarItem => item !== null)
        .filter((item) => {
          const airTime = new Date(item.aired_at).getTime();
          return airTime >= lowerBound && airTime <= upperBound;
        });

      return candidates;
    } catch {
      return [] as CalendarItem[];
    }
  });

  // Flatten and dedupe (next/last can occasionally point at the same episode).
  const seen = new Set<number>();
  const items: CalendarItem[] = [];
  for (const showItems of itemsPerShow) {
    for (const item of showItems) {
      if (seen.has(item.item_id)) continue;
      seen.add(item.item_id);
      items.push(item);
    }
  }

  items.sort((a, b) => a.aired_at.localeCompare(b.aired_at));
  return NextResponse.json({ items });
}

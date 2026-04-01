# Riven UX Port — Design Spec

> Port riven-frontend's consumer UX into Fable, replacing the current half-baked discovery/search/detail pages with riven's proven flows. Keep Fable's video player, Jellyfin auth, multi-account support, and subtitle system.

**Branch:** `riven-ux-port` (off `fable`)

**Reference implementation:** `.local/riven-frontend/` (SvelteKit app, full source available)

---

## Motivation

The current Fable discovery/search/detail pages were a first attempt that didn't land:
- Search only finds Jellyfin content — can't discover or request new content
- Discover page has z-index bugs and shows "request" for items already in the library
- No unified detail page for TMDB items vs Jellyfin items
- No library view showing Riven pipeline states

Riven-frontend has solved all of these problems with a well-thought-out UX. Rather than patching the current implementation, port riven's consumer flows wholesale.

---

## Scope

### Port (consumer experience)
- Home page (hero carousel, recently added, trending sections)
- Explore/search (TMDB universal search, type filters, infinite scroll)
- Library (Riven-backed, with filters and pagination)
- Media detail page (multi-source ratings, request actions, seasons/episodes with status badges, cast, recommendations)
- Calendar (upcoming releases from Riven)
- Notification system (Riven SSE pipeline events)

### Skip (admin tooling)
- Dashboard with stats
- Logs page
- Manual scrape with magnet parsing
- Raw Data dialog
- Bulk library operations (reset/retry/remove selected)
- Item Reset, Retry, Pause, Delete buttons
- Settings for Riven backend
- Theme switcher (single theme only)

### Keep from Fable
- Video player + subtitle overlay (SubDL integration)
- Jellyfin auth + multi-account support
- `AppSidebar` (adapt nav items to new routes)
- shadcn/ui component library
- Next.js App Router architecture
- Existing Riven API proxy routes
- Existing TMDB server actions

---

## Theme

**Single theme: Dark Matter** — no theme switcher, no light mode.

OKLCH color space throughout:

| Role | Variable | Value |
|------|----------|-------|
| Background | `--background` | `oklch(0.1797 0.0043 308.1928)` — near-black, faint purple tint |
| Foreground | `--foreground` | `oklch(0.8109 0 0)` — light gray |
| Card | `--card` | `oklch(0.1822 0 0)` — neutral near-black |
| Primary (amber) | `--primary` | `oklch(0.7214 0.1337 49.9802)` — the brand accent |
| Primary foreground | `--primary-foreground` | `oklch(0.1797 0.0043 308.1928)` |
| Secondary (teal) | `--secondary` | `oklch(0.594 0.0443 196.0233)` |
| Muted surface | `--muted` | `oklch(0.252 0 0)` |
| Muted text | `--muted-foreground` | `oklch(0.6268 0 0)` |
| Accent surface | `--accent` | `oklch(0.3211 0 0)` |
| Border/input | `--border` | `oklch(0.252 0 0)` |
| Ring | `--ring` | `oklch(0.7214 0.1337 49.9802)` — amber, matches primary |
| Destructive | `--destructive` | `oklch(0.45 0.18 25)` |
| Radius | `--radius` | `0.75rem` |

Sidebar variables mirror the card/primary palette. Drop aurora background effects — the riven aesthetic uses blurred backdrop imagery instead.

---

## Routing

### Replace

| Current Route | New Route | Description |
|---------------|-----------|-------------|
| `/` (home) | `/` | Riven-style home (hero carousel + recently added + trending) |
| `/discover` | Remove | Merged into home + explore |
| `/search?q=...` | `/explore?query=...` | TMDB universal search with type filters |
| `/movie/[id]` | `/details/[id]/movie` | Unified detail page |
| `/series/[id]` | `/details/[id]/tv` | Unified detail page |
| — | `/library` | Riven-backed library with filters |
| — | `/calendar` | Upcoming releases |

### Keep unchanged

- `/player/[id]` — Fable's video player
- `/person/[id]` — person detail
- `/settings` — existing settings
- Auth flow — existing Jellyfin auth

---

## Data Sources

| Surface | Source | Endpoint |
|---------|--------|----------|
| Hero carousel | TMDB | `GET /3/trending/all/day` |
| Recently added | Riven | `GET /api/v1/items?sort=date_desc&limit=15&type=movie&type=show` |
| Trending movies/TV | TMDB | `GET /3/trending/{movie\|tv}/{day\|week}` |
| Trending anime | AniList | GraphQL `https://graphql.anilist.co` |
| Search results | TMDB | `GET /3/search/multi` or `GET /3/discover/{type}` |
| Library items | Riven | `GET /api/v1/items` with type/sort/search params |
| Media detail (movies) | TMDB + Riven | TMDB `GET /3/movie/{id}?append_to_response=...` + Riven `GET /api/v1/items/{tmdb_id}?media_type=movie&extended=true` |
| Media detail (TV) | TMDB + Riven | TMDB for metadata + Riven for pipeline state |
| Ratings | TMDB + IMDb + RT | Aggregated via ratings API route (port from riven) |
| Logos + certification | TMDB | `GET /3/{type}/{id}/images` + content ratings |
| Calendar | Riven | `GET /api/v1/calendar` |
| Notifications | Riven SSE | `GET /api/v1/stream/notifications` |
| Playback | Jellyfin | Cross-reference TMDB ID → Jellyfin ID via existing `tmdbMap` |

### No separate database needed

All state lives in Riven (pipeline), Jellyfin (playback/auth), and TMDB (metadata). Client-side caching uses sessionStorage (5-min TTL for trending) and localStorage (preferences).

---

## Page Designs

### Home (`/`)

Port riven's home 1:1:

1. **Hero carousel** — Embla carousel with TMDB trending all/day. Per-slide content:
   - Logo image (fetched on demand from TMDB, fallback to text title)
   - Metadata row: Movie/TV badge, certification, year, language, ratings
   - Overview (2-line clamp)
   - Genre pills (up to 4)
   - "Play Now" button (visible when item is Completed in Riven) + "More Info" button
   - Auto-rotate 5s, loop enabled, dot/segment indicators at bottom
   - Left/right arrow navigation (desktop only)

2. **Recently Added** — From Riven, 15 most recent items. Horizontal `MediaCarousel` of portrait cards. No client caching (always fresh from server).

3. **Trending Movies** — TMDB trending movies. Today/This Week toggle (spring-animated pill). Horizontal carousel + "View All" → `/lists/trending/movie`.

4. **Trending TV Shows** — Same pattern as movies.

5. **Trending Anime** — AniList trending. Horizontal carousel + "View All" → `/lists/trending/anime`.

Section entrance animations: fly-in with staggered delays (100ms intervals).

### Explore (`/explore`)

Port riven's explore:

**Empty state (no query):**
- Rotating hero item from trending pool (title, overview, ratings, backdrop)
- "Feeling Lucky" button — random item from popular pool → detail page
- Trending suggestion chips (6 titles, rotating every 4s)

**Search active:**
- TMDB search with type filter tabs: All / Movies / TV Shows / People
- Responsive grid (2→9 columns by viewport)
- Infinite scroll via IntersectionObserver
- Results link to `/details/[id]/movie`, `/details/[id]/tv`, or `/person/[id]`

**Search mechanics:**
- 300ms debounce from header input
- `Cmd+K` / `Ctrl+K` keyboard shortcut to focus
- URL-driven: `goto('/explore?query=...')` with `replaceState`

### Library (`/library`)

Port riven's library (consumer subset):

- **Source:** Riven `GET /api/v1/items` (not Jellyfin directly)
- **Filters:** Type multi-select (movie, show), sort (date desc/asc, title asc/desc), text search
- **Layout:** Responsive grid (2→7 columns), server-driven pagination
- **Item count:** Displayed below heading (e.g., "6,415 items")
- **Cards:** Portrait cards linking to `/details/[id]/movie` or `/details/[id]/tv`
- **Skip:** State filter, bulk selection, admin actions (consumer-only view)

### Media Detail (`/details/[id]/[type]`)

Port riven's detail page layout:

**Hero banner:**
- Fixed blurred backdrop (`opacity-30 blur-3xl`) behind content
- Rounded hero card (`h-[40vh]`, `rounded-3xl`) with backdrop image
- Bottom-left: logo image or text title
- Bottom-right: Play button (when Completed → launches Fable's player via Jellyfin ID) + Trailer button (YouTube embed overlay)

**Content section:**
- Two-column grid on desktop: poster (left) + content (right)
- Title + StatusBadge (Riven pipeline state)
- Action buttons: Request (if not in Riven), Request More Seasons (TV only)
- Metadata line: year, runtime, language, certification, status
- Genre pills
- Multi-source ratings row: TMDB score, IMDb (movies), Rotten Tomatoes critics + audience. Each with logo SVG and score. Ratings fetched client-side, cached 1hr.
- Overview paragraph

**Seasons/Episodes (TV):**
- Season carousel with portrait cards, each with StatusBadge
- Episode grid (1→4 columns) with landscape cards: episode number, title, aired date, runtime, StatusBadge
- Episode detail drawer (mobile: bottom drawer, desktop: right sheet): overview, still image, file metadata if available

**Bottom sections:**
- Cast horizontal carousel (portrait cards linking to `/person/[id]`)
- Recommendations carousel (from TMDB)
- Similar carousel (from TMDB)

**Playback integration:**
- Play button visible when Riven state is `Completed`
- Cross-references TMDB ID → Jellyfin ID via `tmdbMap`
- Navigates to Fable's existing `/player/[jellyfinId]` route
- Fable's player handles subtitles, quality selection, etc.

### Calendar (`/calendar`)

- Items from Riven `GET /api/v1/calendar`
- Grouped by `aired_at` date
- Filterable by type (movie, episode, show, season)
- Items link to detail pages

---

## Component Architecture

### Port from riven-frontend (reimplemented in React + shadcn/ui)

| Riven Component | Fable Component | Description |
|----------------|-----------------|-------------|
| `TmdbNowPlaying` | `HeroCarousel` | Embla carousel, TMDB trending, auto-rotate, logos, ratings |
| `ListCarousel` | `MediaCarousel` | Embla free-drag horizontal scroll |
| `PortraitCard` | `PortraitCard` | 2:3 poster card, gradient overlay, title, subtitle |
| `LandscapeCard` | `EpisodeCard` | 16:9 episode still, status badge, metadata |
| `StatusBadge` | `StatusBadge` | Riven pipeline states with color coding |
| `ListItem` | `MediaLink` | Wraps card in `<Link>` with correct detail route |
| `AnimatedToggle` | `TogglePill` | Spring-animated pill selector (Today/This Week) |
| `SeasonSelector` | `SeasonSelector` | Season picker for TV request dialog |
| Search input | `SearchBar` | Centered, Cmd+K, debounced → `/explore` |

### Status badge colors (from riven)

| State | Color |
|-------|-------|
| Completed | Emerald green (`bg-emerald-600/80`) |
| Requested | Sky blue (`bg-sky-600/80`) |
| Downloading | Amber (`bg-amber-600/80`) |
| Paused | Slate gray (`bg-slate-500/80`) |
| Failed / Unknown | Destructive red |
| Other states | Amber |

### Keep from Fable

- Video player + subtitle overlay
- `AppSidebar` (update nav items)
- Auth components
- shadcn/ui primitives
- `RequestSheet` (adapt for new detail page)

---

## API Routes to Build

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/riven/items` | GET | Proxy Riven `GET /api/v1/items` (library, recent) |
| `/api/riven/items/add` | POST | Proxy Riven `POST /api/v1/items/add` (request content) |
| `/api/riven/items/[id]` | GET | Proxy Riven `GET /api/v1/items/{id}` (detail state) |
| `/api/riven/calendar` | GET | Proxy Riven `GET /api/v1/calendar` |
| `/api/ratings/[tmdbId]` | GET | Port riven's ratings aggregator (TMDB + IMDb + RT) |
| `/api/tmdb/logo/[type]/[id]` | GET | TMDB logo images + certification |
| `/api/anilist/trending` | GET | AniList GraphQL trending anime |

### Keep existing

- TMDB server actions (`src/actions/tmdb.ts`)
- Riven SSE proxy (`/api/riven/stream/[eventType]`)
- TMDB API proxy (`/api/tmdb/[...slug]`)
- Request server actions (`src/actions/request.ts`)
- Jellyfin TMDB map hook (`use-jellyfin-tmdb-map.ts`)
- Notification context (`notifications-context.tsx`)

---

## Files to Remove

### Pages
- `app/(main)/discover/page.tsx`
- `app/(main)/search/page.tsx`
- `app/(main)/movie/[id]/page.tsx` (if exists as separate route)
- `app/(main)/series/[id]/page.tsx` (if exists as separate route)

### Components
- `src/components/discover/discover-hero.tsx`
- `src/components/discover/discover-sections.tsx`
- `src/components/discover/genre-filter-bar.tsx`
- `src/components/discovery-card.tsx`
- `src/components/discovery-section.tsx`
- `src/components/aurora-background.tsx`
- `src/components/vibrant-aurora-background.tsx`

---

## Implementation Order

1. **Theme** — Apply Dark Matter CSS variables, remove aurora backgrounds
2. **Shared components** — PortraitCard, MediaCarousel, StatusBadge, TogglePill, MediaLink, EpisodeCard
3. **API routes** — Riven proxies, ratings aggregator, logo endpoint, AniList
4. **Home page** — Hero carousel + recently added + trending sections
5. **Explore page** — Search with type filters, infinite scroll, empty state
6. **Library page** — Riven-backed grid with filters and pagination
7. **Media detail page** — Unified detail with ratings, seasons/episodes, cast, recommendations
8. **Calendar page** — Riven calendar grouped by date
9. **Cleanup** — Remove old pages/components, update sidebar nav, verify all flows

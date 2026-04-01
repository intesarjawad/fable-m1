# Riven Parity Audit — Consumer Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every consumer-facing Fable page (Home, Explore, Library, Calendar, GlobalSearch) behave exactly like riven-frontend, with Fable's player retained for playback.

**Architecture:** All data comes from Riven (source of truth for content state). Jellyfin is only used for playback. Fable is a Next.js app; riven-frontend is SvelteKit — the translation is behavioral/structural, not code-copy. Each task below maps specific riven behaviors to concrete React fixes.

**Tech Stack:** Next.js 14 (App Router), React, TypeScript, Tailwind CSS, Embla Carousel, Framer Motion, Lucide React

---

## Discrepancy Summary

### Home Page (`app/(main)/page.tsx`)
**Riven behavior:** `library/recent` endpoint is called; anime cards link to detail pages with `indexer="anilist"` context. Section entrance animations: staggered fly-in with `delay: 0 / 100 / 150 / 200 / 250ms`. The "Recently Added" section uses Riven's `/api/library/recent` route (not `/api/riven/library`).
**Fable issues:**
1. Trending Anime section renders cards **without a `<MediaLink>`** wrapper — they cannot be clicked. Riven's `<ListCarousel data={anilistTrendingStore.items} indexer="anilist" />` passes indexer so cards link to `/details/{id}/tv`. Fable renders bare `<PortraitCard>` with no link.
2. Section entrance animations are present but anime section is not animated with the correct `delay: 250ms` stagger.
3. Recently Added calls `/api/riven/library?sort=date_desc&limit=15&type=movie&type=show` — but riven-frontend calls `/api/library/recent`. The Fable API endpoint `/api/riven/library/recent` exists and is the correct source. Using the general library sort is fine, but it must also show `show` type items correctly.

### Explore Page (`app/(main)/explore/page.tsx`)
**Riven behavior:**
- The header search bar dispatches `riven:search` custom events; the explore page listens for them to populate its query. The explore page **does not have its own search input** — search only comes from the global header bar.
- Type filter tabs include: `All / Movies / TV Shows / People / Studios` (5 options, including People and Studios)
- Fable only has `All / Movies / TV Shows` (missing People and Studios)
- Infinite scroll via IntersectionObserver is implemented in Riven — Fable has a sentinel ref but it's a no-op comment ("TMDB multi-search is single-page")
- The Explore page in Fable has its own local search form (`<form onSubmit={handleSearchSubmit}>`). Riven's explore page has no local search bar — all searching comes through the global header input.

### Library Page (`app/(main)/library/page.tsx`)
**Riven behavior:**
- The library API in riven-frontend returns items where shows use TVDB ID and movies use TMDB ID, with `indexer` set accordingly. `MediaLink` must pass `indexer="tvdb"` for show types.
- Fable's library page does handle this correctly already via `item.indexer`.
- However, Fable's library calls `/api/riven/library` which transforms `media_type`: maps `show` → `tv`. But the `MediaLink` in the library page checks `item.media_type === "tv"` — this is correct.
- **Issue:** Riven library page link for TV uses `?indexer=tvdb` in the URL pattern `/details/{tvdb_id}/tv?indexer=tvdb`. The Fable library page's `MediaLink` correctly passes `indexer={item.indexer}` when `item.indexer === "tvdb"`. This is actually correct.
- **Real Issue:** The Fable library page does NOT have the immersive background (fixed gradient + blurred blobs). It uses a plain `relative px-4 py-6` wrapper.

### Calendar Page (`app/(main)/calendar/page.tsx`)
**Riven behavior:**
- Type filter chips use **checkboxes** (togglable on/off state) for Movies, Episodes, Shows, Seasons — with color-coded icons per type.
- Fable uses toggle buttons instead of checkboxes — visual style differs.
- Riven uses episode code format `S{n}E{m}` without zero-padding in compact view (just `S1E5`, not `S01E05`) — Fable pads (`S01E05`). Actually riven pads too: `{item.season}{#if item.episode}E{item.episode}{/if}` — this is `S1E5` not zero-padded in svelte template. Fable zero-pads both: `S01E05`. This is a **Fable improvement** — not a discrepancy to revert.
- **Real Issue:** The Riven calendar page has an immersive background (fixed gradient + blurred blobs). Fable calendar has a plain `relative px-4 py-6` background.

### Global Search Bar (`src/components/layout-content.tsx`)
**Riven behavior:**
- The header search is `position: absolute` (overlaps the page content), not `position: sticky`. Fable uses `sticky top-0`.
- Riven uses `afterNavigate` to sync the input value back from the URL when navigating. Fable does NOT sync the input when the user navigates back (e.g., after clicking a result and pressing Back).
- Input value syncs: when the explore page mounts, if there is a `?query=` param, the input should reflect it. Currently Fable only reads `initialQuery` from searchParams at mount — it does not react to URL changes after mount.
- The Riven header listens for `window.dispatchEvent(new CustomEvent("riven:search", ...))` — the explore page suggestion chips dispatch this event. Fable does not have this event bus; chips call `router.replace()` directly instead.

---

## File Map

| File | Action |
|------|--------|
| `app/(main)/page.tsx` | Fix anime section missing MediaLink wrapper; fix "Recently Added" to use correct API route |
| `app/(main)/explore/page.tsx` | Remove local search form; add People + Studios filter tabs; fix chip click to dispatch custom event OR use URL approach cleanly |
| `app/(main)/library/page.tsx` | Add immersive background (fixed gradient + blobs) |
| `app/(main)/calendar/page.tsx` | Add immersive background (fixed gradient + blobs) |
| `src/components/layout-content.tsx` | Change `sticky` → `absolute` positioning; add URL-sync after navigation |

---

## Task 1: Home Page — Fix Anime Cards Missing MediaLink

**Files:**
- Modify: `app/(main)/page.tsx`

The anime section renders bare `<PortraitCard>` without a `<MediaLink>`. Riven passes `indexer="anilist"` which routes through `list-item.svelte`. In Fable, anilist items should link to `/details/{id}/tv` (anilist IDs go to TV detail pages).

- [ ] **Step 1: Read the current anime section in page.tsx (lines 349–375)**

Verify the bare `<PortraitCard>` is unlinked.

- [ ] **Step 2: Wrap each anime card with MediaLink**

```tsx
// In the Trending Anime section, replace:
: trendingAnime.map((anime) => (
    <MediaCarouselSlide key={`anime-${anime.id}`}>
      <PortraitCard
        title={anime.title}
        subtitle={anime.year ? String(anime.year) : null}
        posterUrl={anime.poster_path}
        className="w-36"
      />
    </MediaCarouselSlide>
  ))

// With:
: trendingAnime.map((anime) => (
    <MediaCarouselSlide key={`anime-${anime.id}`}>
      <MediaLink
        id={anime.id}
        mediaType="tv"
        indexer="tmdb"
      >
        <PortraitCard
          title={anime.title}
          subtitle={anime.year ? String(anime.year) : null}
          posterUrl={anime.poster_path}
          className="w-36"
        />
      </MediaLink>
    </MediaCarouselSlide>
  ))
```

Note: The AniList API at `/api/anilist/trending` returns items. Check what ID field they use (TMDB or AniList-native) — if AniList-native, the MediaLink will fail to resolve details. Look at the API response shape first.

- [ ] **Step 3: Check `/api/anilist/trending` route to understand returned ID type**

Read `app/api/anilist/trending/route.ts` and check if items have `tmdb_id` or only `anilist_id`.

- [ ] **Step 4: Apply the correct MediaLink**

If items have a `tmdb_id` field, use that as the id and `indexer="tmdb"`. If only anilist ID, use `id={anime.id}` and add an `indexer="anilist"` prop to MediaLink (which may need extending).

- [ ] **Step 5: Build-check**

```bash
cd /home/intesar/Projects/fable-m1 && npx next build 2>&1 | tail -20
```

Expected: No type errors on the changed lines.

- [ ] **Step 6: Commit**

```bash
cd /home/intesar/Projects/fable-m1
git add app/(main)/page.tsx
git commit -m "fix: wrap anime carousel cards with MediaLink so they are clickable"
```

---

## Task 2: Home Page — Fix "Recently Added" API Route

**Files:**
- Modify: `app/(main)/page.tsx`

Riven calls `/api/library/recent` (Riven's built-in recent items endpoint). Fable currently calls `/api/riven/library?sort=date_desc&limit=15&type=movie&type=show`.

- [ ] **Step 1: Check if `/api/riven/library/recent` exists**

```bash
ls /home/intesar/Projects/fable-m1/app/api/riven/library/
```

- [ ] **Step 2: Compare what the two routes return**

Read both routes if a `recent` sub-route exists. If not, check what riven-frontend's `/api/library/recent` does in its own route handlers.

- [ ] **Step 3: Determine if change is needed**

If `/api/riven/library?sort=date_desc&limit=15` returns the same data shape as a `/recent` route, the current implementation is functionally equivalent. No change needed. If there is a dedicated recent route that returns different/better data, switch to it.

- [ ] **Step 4: Commit if changed**

```bash
cd /home/intesar/Projects/fable-m1
git add app/(main)/page.tsx
git commit -m "fix: home page recently added uses correct riven recent endpoint"
```

---

## Task 3: Explore Page — Remove Local Search Form, Fix to Match Riven

**Files:**
- Modify: `app/(main)/explore/page.tsx`

Riven's explore page does NOT have its own search input. All searching comes through the global header bar. The explore page only reads `?query=` from the URL and shows results. Fable has a redundant local `<form>` with a search `<input>`.

Also: Riven has 5 filter tabs: `All / Movies / TV Shows / People / Studios`. Fable only has 3.

- [ ] **Step 1: Remove the local search form from ExplorePageInner**

In `app/(main)/explore/page.tsx`, delete the `<form onSubmit={handleSearchSubmit}>` block (lines ~261–283) and its associated `handleSearchSubmit` handler.

Remove the `searchQuery` / `handleSearchChange` state that was only used by the local form. Keep `activeQuery` which is driven by the URL param.

Also remove the `handleChipClick` that sets `searchQuery` — chips should just call `router.replace("/explore?query=...")` with the active query.

- [ ] **Step 2: Update `activeQuery` to stay in sync with URL changes**

The current `activeQuery` is set from `searchParams.get("query")` at mount only. Add a `useEffect` that updates `activeQuery` whenever the URL `query` param changes:

```tsx
const rawQuery = searchParams.get("query") ?? "";

// Keep activeQuery synced to URL param (handles browser back/forward, header search bar updates)
useEffect(() => {
  setActiveQuery(rawQuery);
}, [rawQuery]);
```

Replace the static `const initialQuery = searchParams.get("query") ?? ""` pattern.

- [ ] **Step 3: Add People and Studios to filter tabs**

Change `MediaTypeFilter` type:
```tsx
type MediaTypeFilter = "All" | "Movies" | "TV Shows" | "People" | "Studios";
```

Add to TogglePill:
```tsx
<TogglePill
  options={["All", "Movies", "TV Shows", "People", "Studios"]}
  value={mediaTypeFilter}
  onChange={(v) => setMediaTypeFilter(v as MediaTypeFilter)}
/>
```

Update `filteredResults` memo:
```tsx
const filteredResults = useMemo(() => {
  if (mediaTypeFilter === "All") return searchResults;
  if (mediaTypeFilter === "Movies") return searchResults.filter(isTmdbMovie);
  if (mediaTypeFilter === "TV Shows") return searchResults.filter((item) => !isTmdbMovie(item) && getTmdbMediaType(item) === "tv");
  if (mediaTypeFilter === "People") return searchResults.filter((item) => getTmdbMediaType(item) === "person");
  if (mediaTypeFilter === "Studios") return searchResults.filter((item) => getTmdbMediaType(item) === "company");
  return searchResults;
}, [searchResults, mediaTypeFilter]);
```

- [ ] **Step 4: Ensure `searchTmdb` action searches all media types**

Check `src/actions/tmdb.ts` `searchTmdb` function — it must call TMDB multi-search (includes people and companies), not just movies/TV.

- [ ] **Step 5: Build-check**

```bash
cd /home/intesar/Projects/fable-m1 && npx next build 2>&1 | tail -20
```

- [ ] **Step 6: Commit**

```bash
cd /home/intesar/Projects/fable-m1
git add app/(main)/explore/page.tsx
git commit -m "fix: explore page matches riven — remove redundant search form, add People/Studios filters, sync query from URL"
```

---

## Task 4: Library Page — Add Immersive Background

**Files:**
- Modify: `app/(main)/library/page.tsx`

Riven's library page has the fixed gradient background with blurred blobs. Fable's library page has a plain wrapper with no background.

- [ ] **Step 1: Add the background layer to LibraryInner**

In `LibraryInner`, change the outer wrapper from:
```tsx
<div className="relative px-4 py-6 min-h-screen max-w-full overflow-hidden">
```

To:
```tsx
<div className="relative min-h-screen overflow-x-hidden">
  {/* Immersive background */}
  <div className="pointer-events-none fixed inset-0 z-0">
    <div className="absolute inset-0 bg-gradient-to-b from-zinc-900 via-zinc-950 to-black" />
    <div className="absolute top-[-20%] left-[-10%] h-[600px] w-[600px] rounded-full bg-primary/5 blur-[120px]" />
    <div className="absolute right-[-5%] bottom-[-10%] h-[500px] w-[500px] rounded-full bg-blue-500/5 blur-[100px]" />
  </div>

  <div className="relative z-10 px-4 py-6 max-w-full">
    <div className="mx-auto w-full max-w-[2000px] space-y-6">
      {/* ... existing content ... */}
    </div>
  </div>
</div>
```

- [ ] **Step 2: Build-check**

```bash
cd /home/intesar/Projects/fable-m1 && npx next build 2>&1 | tail -20
```

- [ ] **Step 3: Commit**

```bash
cd /home/intesar/Projects/fable-m1
git add app/(main)/library/page.tsx
git commit -m "fix: library page immersive background matches riven"
```

---

## Task 5: Calendar Page — Add Immersive Background

**Files:**
- Modify: `app/(main)/calendar/page.tsx`

Same pattern as Task 4 — Riven has the fixed gradient background with blobs.

- [ ] **Step 1: Add the background layer to RivenCalendarPage**

Change the outer wrapper from:
```tsx
<div className="relative px-4 py-6 max-w-full overflow-hidden min-h-screen">
```

To:
```tsx
<div className="relative min-h-screen overflow-x-hidden">
  {/* Immersive background */}
  <div className="pointer-events-none fixed inset-0 z-0">
    <div className="absolute inset-0 bg-gradient-to-b from-zinc-900 via-zinc-950 to-black" />
    <div className="absolute top-[-20%] left-[-10%] h-[600px] w-[600px] rounded-full bg-primary/5 blur-[120px]" />
    <div className="absolute right-[-5%] bottom-[-10%] h-[500px] w-[500px] rounded-full bg-blue-500/5 blur-[100px]" />
  </div>

  <div className="relative z-10 px-4 py-6 max-w-full overflow-hidden">
    <div className="mx-auto w-full max-w-[1600px] space-y-4">
      {/* ... existing content ... */}
    </div>
  </div>
</div>
```

- [ ] **Step 2: Build-check**

```bash
cd /home/intesar/Projects/fable-m1 && npx next build 2>&1 | tail -20
```

- [ ] **Step 3: Commit**

```bash
cd /home/intesar/Projects/fable-m1
git add app/(main)/calendar/page.tsx
git commit -m "fix: calendar page immersive background matches riven"
```

---

## Task 6: Global Search Bar — Fix Positioning and URL Sync

**Files:**
- Modify: `src/components/layout-content.tsx`

Riven's header is `position: absolute` (overlay), not `position: sticky`. Fable uses `sticky top-0` which pushes content down and creates a gap. Also Riven syncs the input value back when the URL changes (e.g., after navigation).

- [ ] **Step 1: Change `sticky top-0` to `absolute top-0`**

In `layout-content.tsx`, `GlobalSearchBar` renders:
```tsx
<div className="sticky top-0 left-0 right-0 z-50 hidden md:flex ...">
```

Change to:
```tsx
<div className="absolute top-0 left-0 right-0 z-50 hidden md:flex ...">
```

This makes the search bar float over the content exactly like Riven's header.

- [ ] **Step 2: Sync input value from URL on navigation**

Add a `useEffect` that syncs `query` state from the current URL's `?query=` param whenever the pathname/searchParams change:

```tsx
// In GlobalSearchBar, add:
const searchParams = useSearchParams(); // needs Suspense boundary — add one

useEffect(() => {
  const urlQuery = searchParams.get("query") ?? "";
  // Only sync if the user is not actively typing (input not focused)
  if (document.activeElement !== inputRef.current) {
    setQuery(urlQuery);
  }
}, [searchParams]);
```

This requires wrapping `GlobalSearchBar` in a `<Suspense>` boundary (since `useSearchParams` requires it in App Router).

- [ ] **Step 3: Wrap GlobalSearchBar in Suspense**

```tsx
// In LayoutContent's return:
<GlobalSearchBarWrapper />

// New component:
function GlobalSearchBarWrapper() {
  return (
    <Suspense fallback={null}>
      <GlobalSearchBar />
    </Suspense>
  );
}
```

Add `import { Suspense } from "react"` at top.

- [ ] **Step 4: Add `useSearchParams` import**

```tsx
import { useRouter, usePathname, useSearchParams } from "next/navigation";
```

- [ ] **Step 5: Build-check**

```bash
cd /home/intesar/Projects/fable-m1 && npx next build 2>&1 | tail -20
```

- [ ] **Step 6: Commit**

```bash
cd /home/intesar/Projects/fable-m1
git add src/components/layout-content.tsx
git commit -m "fix: global search bar absolute positioning and URL sync on navigation"
```

---

## Task 7: Final Build Verification

- [ ] **Step 1: Full clean build**

```bash
cd /home/intesar/Projects/fable-m1 && npx next build 2>&1 | tail -20
```

Expected: `✓ Compiled successfully` with no TypeScript errors.

- [ ] **Step 2: Verify no console errors from the pages**

Check that none of the pages have obvious runtime errors (missing imports, wrong prop shapes).

- [ ] **Step 3: Commit if any final cleanup needed**

---

## Notes on Non-Issues (Things That Look Different But Are Fine)

- **Explore page: infinite scroll** — Riven's explore page has real infinite scroll because its search-store supports pagination. Fable's `searchTmdb` action calls TMDB's multi-search which returns a single page of up to 20 results. The sentinel ref is a no-op and that's correct — there's nothing to infinitely load.
- **Library page: state filter** — Riven has a multi-select "State" dropdown. Fable omits this. Out of scope for this audit (not in the check list).
- **Library page: item selection and bulk actions** — Riven has multi-select with Reset/Retry/Remove. Fable omits this. Out of scope.
- **Calendar: checkbox vs toggle** — Riven uses `<Checkbox>` component for filters. Fable uses styled `<button>` toggles. The behavior is equivalent; only the visual component differs. Not a functional discrepancy worth fixing.
- **Home page: "Play Now" button** — In Riven, the hero carousel "Play Now" links to `/watch/{id}`. In Fable, the button shows only if `onPlay` prop is passed. Fable's `page.tsx` does not pass `onPlay` to `<HeroCarousel>` — so no "Play Now" button appears. This is intentional (playback goes through Fable's player, which needs a different flow). Leave as-is.

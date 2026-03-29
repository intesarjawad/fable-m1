# Replace Seerr Integration with Riven

Date: 2026-03-29

## Goal

Remove the entire Seerr/Overseerr/Jellyseerr integration and replace it with a minimal Riven connection layer. Riven is the media management backbone (Real-Debrid + content automation), but Fable doesn't need to duplicate Riven's frontend — just establish the plumbing for future use and provide admin-only connection management.

## Non-goals

- Riven-powered discover/search page (Riven's own frontend handles this)
- RD account status display (visible in Riven dashboard)
- Pipeline monitoring or stats dashboard (visible in Riven dashboard)
- Content request UI (content is auto-curated via Trakt/Mdblist lists)

---

## What gets deleted

### Files to remove entirely

| File | What it was |
|------|-------------|
| `src/contexts/seerr-context.tsx` | SeerrProvider + useSeerr hook |
| `src/actions/seerr.ts` | All Seerr API action functions |
| `src/actions/store/store-seerr-data.ts` | StoreSeerrData cookie wrapper |
| `src/types/seerr-types.ts` | Seerr response type definitions |
| `src/types/seerr.d.ts` | Auto-generated Seerr OpenAPI types |
| `app/api/seerr/[...slug]/route.ts` | Seerr API proxy route |
| `src/components/seerr-section.tsx` | Seerr media section (horizontal scroll row) |
| `src/components/seerr-card.tsx` | Seerr media card |
| `src/components/seerr-request-modal.tsx` | Request modal with season picker |
| `src/components/seerr-request-card.tsx` | Request status card |
| `src/components/seerr-request-section.tsx` | Request section (horizontal scroll row) |
| `src/components/seerr-section-skeleton.tsx` | Skeleton loader for seerr sections |
| `src/components/settings/seerr-section.tsx` | Seerr config UI in settings |
| `src/components/discover-widgets.tsx` | Discover page content orchestrator |
| `src/components/discover/not-connected.tsx` | "Not connected" placeholder |
| `src/hooks/use-seerr-dashboard.ts` | Seerr dashboard data fetching hook |
| `app/(main)/discover/page.tsx` | Discover page route |

### Files to modify

| File | Change |
|------|--------|
| `app/(main)/layout.tsx` | Remove `SeerrProvider` wrapper |
| `app/(main)/settings/page.tsx` | Replace `SeerrSection` with `RivenSection` (admin-only) |
| `src/components/app-sidebar.tsx` | Remove Discover nav link |
| `src/components/search-component.tsx` | Remove all Seerr search integration (seerr suggestions, StoreSeerrData check, SeerrRequestModal, seerr badge) |
| `src/actions/store/server-actions.ts` | Remove `SeerrAuthData` type, `setSeerrData`, `getSeerrData`, `removeSeerrData` functions and the `SEERR_DATA_KEY` constant. Add Riven equivalents. |
| `src/actions/auth.ts` | Remove `StoreSeerrData` import and the `StoreSeerrData.remove()` call in `logout()`. Do NOT add a Riven equivalent — Riven config is server-wide, not per-user session. |
| `src/actions/index.ts` | Remove `export { testSeerrConnection } from "./seerr"` re-export. |
| `src/components/search-suggestion-item.tsx` | Remove `isSeerr` prop and TMDB image URL branch. All results are Jellyfin-only. |

---

## What gets added

### 1. Riven config storage (`src/actions/store/server-actions.ts`)

Add to existing server actions file:

```typescript
// --- Riven config ---
const RIVEN_CONFIG_KEY = "riven-config";

export interface RivenConfig {
  apiUrl: string;
  apiKey: string;
}

export async function setRivenConfig(value: RivenConfig) { ... }
export async function getRivenConfig(): Promise<RivenConfig | null> { ... }
export async function removeRivenConfig() { ... }
```

Cookie-based, same pattern as existing auth storage. Server-side only. Cookie attributes: `httpOnly: true`, `sameSite: "strict"`, `secure: process.env.NODE_ENV === "production"`. The API key is a secret and must not be readable by client-side JavaScript.

### 2. Riven config resolution (`src/actions/riven.ts`)

Single action file that resolves Riven connection details. Priority:

1. Cookie config (set by admin in settings UI)
2. Environment variables (`RIVEN_API_URL`, `RIVEN_API_KEY`)
3. `null` (not configured)

```typescript
export async function resolveRivenConfig(): Promise<{ apiUrl: string; apiKey: string } | null>
export async function testRivenConnection(config?: { apiUrl: string; apiKey: string }): Promise<{ success: boolean; message: string }>
```

Named `resolveRivenConfig` (not `getRivenConfig`) to avoid collision with the cookie-level getter in `server-actions.ts`.

`testRivenConnection` hits `GET /api/v1/health` on the Riven backend. Simple reachability check.

### 3. API proxy route (`app/api/riven/[...slug]/route.ts`)

Catch-all proxy that forwards requests to Riven's API. Injects `x-api-key` header server-side — the frontend never sees the Riven API key.

Supports GET, POST, DELETE methods. Passes through query params and request bodies. Returns Riven's response as-is.

**Authorization:** Non-admin users are restricted to GET requests only. POST, DELETE, and PUT require Jellyfin admin (`Policy.IsAdministrator`). This prevents regular users from mutating Riven state (deleting items, changing settings) through the proxy while still allowing future read-only features like calendar rows.

The proxy checks admin status by reading the Jellyfin auth cookie and inspecting the user policy. If the cookie is missing or invalid, the proxy returns 401.

**Error handling:** If Riven is unreachable, the proxy returns `{ success: false, message: "Riven server unreachable" }` with HTTP 502. Network errors and timeouts (5s) are caught and returned as structured JSON, not raw failures.

### 4. Riven context (`src/contexts/riven-context.tsx`)

Minimal context that checks connection status on mount:

```typescript
interface RivenContextType {
  isConnected: boolean;
  isLoading: boolean;
  connectionError: string | null;  // null = not checked yet or OK, string = error message
}
```

This distinguishes "not configured" (`isConnected: false, connectionError: null`) from "configured but unreachable" (`isConnected: false, connectionError: "Connection refused"`).

Calls `GET /api/riven/health` once on mount. Stores boolean. No request management, no permissions, no recent items — just "is Riven reachable?"

Wrapped in the main layout where SeerrProvider used to be.

### 5. Admin settings section (`src/components/settings/riven-section.tsx`)

Only renders if current user is Jellyfin admin (`user.Policy.IsAdministrator`). Two fields:

- **API URL** — text input, placeholder `http://riven:8080`
- **API Key** — password input

Actions:
- **Test & Save** — calls `testRivenConnection`, saves on success
- **Disconnect** — clears stored config

Shows connected/disconnected status badge.

If ENV vars are set and no cookie override exists, the fields show the ENV values as pre-populated (read-only hint that config comes from environment). Admin can override by entering different values.

### 6. Riven config API route (`app/api/config/riven/route.ts`)

Returns the *existence* of ENV-based Riven config (not the actual API key) so the settings UI can show "configured via environment":

```typescript
// GET response:
{ hasEnvConfig: boolean, envApiUrl: string | null }
```

---

## Search component cleanup

The search bar (`src/components/search-component.tsx`) gets simplified:

- Remove: `seerrSuggestions` state, `StoreSeerrData` check, `searchSeerrItems` call, `SeerrRequestModal`, seerr results section with badge, `isSeerrConnected` state
- Keep: Jellyfin library search (unchanged), keyboard shortcut, debounce logic

Pure Jellyfin search. No external service integration in search.

---

## Sidebar cleanup

Remove the Discover link from `src/components/app-sidebar.tsx`. The nav items become: Home, Libraries, Settings, Admin (if admin).

---

## Admin vs regular user visibility

| Feature | Admin | Regular user |
|---------|-------|-------------|
| Riven settings section on `/settings` | Visible | Hidden |
| Riven connection status | Visible (in settings) | Not shown |
| Riven API proxy | Accessible | Accessible (for future features like calendar rows) |
| Search | Jellyfin only | Jellyfin only |

The RivenContext is available to all users (it's a simple connection check), but no UI surfaces it for non-admins. This keeps the door open for future features like "Coming Soon" rows powered by Riven's calendar endpoint without requiring admin access.

---

## File inventory

### New files

| File | Purpose | Est. lines |
|------|---------|-----------|
| `src/actions/riven.ts` | Config resolution + connection test | ~50 |
| `app/api/riven/[...slug]/route.ts` | API proxy | ~60 |
| `app/api/config/riven/route.ts` | ENV config check endpoint | ~15 |
| `src/contexts/riven-context.tsx` | RivenProvider + useRiven hook | ~50 |
| `src/components/settings/riven-section.tsx` | Admin settings UI | ~180 |

### Modified files

| File | Change |
|------|--------|
| `src/actions/store/server-actions.ts` | Remove Seerr types/functions, add Riven types/functions |
| `app/(main)/layout.tsx` | Replace SeerrProvider with RivenProvider |
| `app/(main)/settings/page.tsx` | Replace SeerrSection with RivenSection |
| `src/components/app-sidebar.tsx` | Remove Discover link and unused `Compass` icon import |
| `src/components/search-component.tsx` | Remove Seerr search integration |
| `src/components/search-suggestion-item.tsx` | Remove `isSeerr` prop and TMDB image branch |
| `src/actions/auth.ts` | Remove `StoreSeerrData` import and `StoreSeerrData.remove()` in logout |
| `src/actions/index.ts` | Remove `testSeerrConnection` re-export |

### Deleted files

17 files (listed in "What gets deleted" section above).

**Net change: ~355 new lines, ~2000+ lines removed.**

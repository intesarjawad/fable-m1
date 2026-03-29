# Seerr-to-Riven Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all Seerr/Overseerr integration and replace with minimal Riven connection plumbing (admin-only settings, API proxy, context provider).

**Architecture:** Delete 17 Seerr files, clean 8 modified files of Seerr references, add 5 new Riven files. Cookie-based config with ENV fallback. Server-side API key injection via Next.js proxy route. Admin-gated mutations.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, server actions (cookies), Jellyfin SDK (for admin check)

**Spec:** `docs/superpowers/specs/2026-03-29-seerr-to-riven-design.md`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Delete | `src/contexts/seerr-context.tsx` | SeerrProvider + useSeerr hook |
| Delete | `src/actions/seerr.ts` | Seerr API actions |
| Delete | `src/actions/store/store-seerr-data.ts` | StoreSeerrData cookie wrapper |
| Delete | `src/types/seerr-types.ts` | Seerr response types |
| Delete | `src/types/seerr.d.ts` | Seerr OpenAPI auto-generated types |
| Delete | `app/api/seerr/[...slug]/route.ts` | Seerr API proxy |
| Delete | `src/components/seerr-section.tsx` | Seerr media section row |
| Delete | `src/components/seerr-card.tsx` | Seerr media card |
| Delete | `src/components/seerr-request-modal.tsx` | Request modal |
| Delete | `src/components/seerr-request-card.tsx` | Request status card |
| Delete | `src/components/seerr-request-section.tsx` | Request section row |
| Delete | `src/components/seerr-section-skeleton.tsx` | Seerr skeleton loader |
| Delete | `src/components/settings/seerr-section.tsx` | Seerr settings UI |
| Delete | `src/components/discover-widgets.tsx` | Discover page widgets |
| Delete | `src/components/discover/not-connected.tsx` | Not-connected placeholder |
| Delete | `src/hooks/use-seerr-dashboard.ts` | Seerr dashboard hook |
| Delete | `app/(main)/discover/page.tsx` | Discover page route |
| Modify | `src/actions/store/server-actions.ts` | Remove Seerr, add Riven config storage |
| Modify | `src/actions/auth.ts` | Remove StoreSeerrData import + logout call |
| Modify | `src/actions/index.ts` | Remove testSeerrConnection re-export |
| Modify | `app/(main)/layout.tsx` | Replace SeerrProvider with RivenProvider |
| Modify | `app/(main)/settings/page.tsx` | Replace SeerrSection with RivenSection |
| Modify | `src/components/app-sidebar.tsx` | Remove Discover link + Compass import |
| Modify | `src/components/search-component.tsx` | Remove all Seerr search integration |
| Modify | `src/components/search-suggestion-item.tsx` | Remove isSeerr prop + TMDB branch |
| Create | `src/actions/riven.ts` | Config resolution + connection test |
| Create | `app/api/riven/[...slug]/route.ts` | Riven API proxy (admin-gated mutations) |
| Create | `app/api/config/riven/route.ts` | ENV config check endpoint |
| Create | `src/contexts/riven-context.tsx` | RivenProvider + useRiven hook |
| Create | `src/components/settings/riven-section.tsx` | Admin-only Riven settings UI |

---

## Task 1: Delete all Seerr files

- [ ] **Step 1: Delete the 17 Seerr files**

```bash
rm src/contexts/seerr-context.tsx
rm src/actions/seerr.ts
rm src/actions/store/store-seerr-data.ts
rm src/types/seerr-types.ts
rm src/types/seerr.d.ts
rm -rf app/api/seerr/
rm src/components/seerr-section.tsx
rm src/components/seerr-card.tsx
rm src/components/seerr-request-modal.tsx
rm src/components/seerr-request-card.tsx
rm src/components/seerr-request-section.tsx
rm src/components/seerr-section-skeleton.tsx
rm src/components/settings/seerr-section.tsx
rm src/components/discover-widgets.tsx
rm -rf src/components/discover/
rm src/hooks/use-seerr-dashboard.ts
rm app/\(main\)/discover/page.tsx
```

- [ ] **Step 2: Commit deletions**

```bash
git add -A
git commit -m "remove: delete all Seerr/Overseerr integration files"
```

---

## Task 2: Clean Seerr references from existing files

**Files:**
- Modify: `src/actions/store/server-actions.ts` (lines 18-27, 118-140)
- Modify: `src/actions/auth.ts` (line 10, lines 443-451)
- Modify: `src/actions/index.ts` (line 130)
- Modify: `app/(main)/layout.tsx` (lines 7, 29, 33)
- Modify: `src/components/app-sidebar.tsx` (lines 56, 247-254)
- Modify: `src/components/search-component.tsx` (lines 13-14, 26-27, 54-68, 82-95, 108-109, 176-179, 197-206, 304-330, 344-351)
- Modify: `src/components/search-suggestion-item.tsx` (lines 32, 38, 44-47)
- Modify: `app/(main)/settings/page.tsx` (lines 4, 30)

- [ ] **Step 1: Clean `server-actions.ts` — remove Seerr types and functions**

Remove the `SeerrAuthType` type (line 18), `SeerrAuthData` type (lines 20-27), and the entire Seerr cookie section (lines 118-140: `SEERR_DATA_KEY`, `setSeerrData`, `getSeerrData`, `removeSeerrData`).

- [ ] **Step 2: Clean `auth.ts` — remove StoreSeerrData import and logout call**

Remove line 10 (`import { StoreSeerrData } from "./store/store-seerr-data";`).

In the `logout` function (line 443), remove `StoreSeerrData.remove()` from the `Promise.all` array. Result:

```typescript
export function logout(navigate: (redirectPath: string) => void) {
  Promise.all([
    StoreAuthData.remove(),
    StoreServerURL.remove(),
  ]).then(() => {
    navigate("/login");
  });
}
```

- [ ] **Step 3: Clean `index.ts` — remove Seerr re-export**

Remove line 130: `export { testSeerrConnection } from "./seerr";`

- [ ] **Step 4: Clean `layout.tsx` — remove SeerrProvider**

Remove the `SeerrProvider` import (line 7) and unwrap from the JSX (lines 29, 33). The layout becomes:

```tsx
return (
  <JotaiProvider>
    <PlaybackProvider>
      <FullscreenDetector />
      <AuthErrorHandler>
        <LayoutContent>{children}</LayoutContent>
      </AuthErrorHandler>
    </PlaybackProvider>
  </JotaiProvider>
);
```

- [ ] **Step 5: Clean `app-sidebar.tsx` — remove Discover link**

Remove the `Compass` import from the lucide-react import block (line 56).

Remove the Discover `SidebarMenuItem` block (lines 247-254):

```tsx
<SidebarMenuItem>
  <SidebarMenuButton asChild>
    <Link href="/discover" onClick={() => setOpenMobile(false)}>
      <Compass className="h-4 w-4" />
      <span>Discover</span>
    </Link>
  </SidebarMenuButton>
</SidebarMenuItem>
```

- [ ] **Step 6: Clean `search-component.tsx` — remove all Seerr integration**

Remove imports: `searchSeerrItems` (line 13), `StoreSeerrData` (line 14), `SeerrRequestModal` (line 15), `Badge` (line 17).

Remove state: `seerrSuggestions` (line 26), `isSeerrConnected` (line 27).

Remove the Seerr connection check `useEffect` (lines 55-68).

In the search `useEffect`, simplify to only search Jellyfin:

```typescript
searchTimeout.current = setTimeout(async () => {
  try {
    const results = await searchItems(searchQuery.trim());
    const sortedResults = results.sort((a: any, b: any) => {
      const typePriority = { Movie: 1, Series: 2, Person: 3, Episode: 4 };
      const aPriority = typePriority[a.Type as keyof typeof typePriority] || 5;
      const bPriority = typePriority[b.Type as keyof typeof typePriority] || 5;
      return aPriority - bPriority;
    });
    setSuggestions(sortedResults.slice(0, 6));
    setShowSuggestions(true);
  } catch (error) {
    console.error("Search failed:", error);
    setSuggestions([]);
  } finally {
    setIsLoading(false);
  }
}, 300);
```

Remove `selectedSeerrItem` state (lines 176-179).

In `handleSuggestionClick`, remove the `isSeerr` parameter and the Seerr branch (lines 197-206).

In the JSX, remove the entire Seerr suggestions section (lines 304-330) and the `SeerrRequestModal` render (lines 344-351).

Update the empty-state check to remove `seerrSuggestions`:

```tsx
{!isLoading && suggestions.length === 0 && searchQuery.trim().length > 2 && (
```

- [ ] **Step 7: Clean `search-suggestion-item.tsx` — remove isSeerr prop**

Remove the `isSeerr?: boolean` from the interface (line 32) and destructuring (line 38).

Replace the ternary image URL (lines 44-48) with:

```typescript
const imageUrl = `${serverUrl}/Items/${item.Id}/Images/Primary`;
```

- [ ] **Step 8: Clean `settings/page.tsx` — remove SeerrSection import and usage**

Remove line 4: `import SeerrSection from "@/src/components/settings/seerr-section";`

Remove line 30: `<SeerrSection />`

- [ ] **Step 9: Verify build compiles**

```bash
bun run build
```

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "remove: clean all Seerr references from existing files"
```

---

## Task 3: Add Riven config storage and resolution

**Files:**
- Modify: `src/actions/store/server-actions.ts`
- Create: `src/actions/riven.ts`
- Create: `app/api/config/riven/route.ts`

- [ ] **Step 1: Add Riven config to `server-actions.ts`**

Append after the existing `executeClearAuthDataAction` function:

```typescript
// --- Riven config ---
const RIVEN_CONFIG_KEY = "riven-config";

export interface RivenConfig {
  apiUrl: string;
  apiKey: string;
}

export async function setRivenConfig(value: RivenConfig) {
  (await cookies()).set(RIVEN_CONFIG_KEY, JSON.stringify(value), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function getRivenConfig(): Promise<RivenConfig | null> {
  const cookieStore = await cookies();
  const val = cookieStore.get(RIVEN_CONFIG_KEY);
  if (!val || !val.value) return null;
  try {
    return JSON.parse(val.value) as RivenConfig;
  } catch {
    return null;
  }
}

export async function removeRivenConfig() {
  (await cookies()).delete(RIVEN_CONFIG_KEY);
}
```

- [ ] **Step 2: Create `src/actions/riven.ts`**

```typescript
"use server";

import {
  getRivenConfig as getStoredRivenConfig,
  setRivenConfig as storeRivenConfig,
  removeRivenConfig as clearStoredRivenConfig,
  type RivenConfig,
} from "./store/server-actions";

export async function resolveRivenConfig(): Promise<RivenConfig | null> {
  const stored = await getStoredRivenConfig();
  if (stored?.apiUrl && stored?.apiKey) {
    return stored;
  }

  const envUrl = process.env.RIVEN_API_URL;
  const envKey = process.env.RIVEN_API_KEY;
  if (envUrl && envKey) {
    return { apiUrl: envUrl, apiKey: envKey };
  }

  return null;
}

export async function testRivenConnection(
  config?: RivenConfig,
): Promise<{ success: boolean; message: string }> {
  const resolved = config || (await resolveRivenConfig());
  if (!resolved) {
    return { success: false, message: "No Riven configuration found" };
  }

  const baseUrl = resolved.apiUrl.replace(/\/+$/, "");

  try {
    const response = await fetch(`${baseUrl}/api/v1/health`, {
      method: "GET",
      headers: {
        "x-api-key": resolved.apiKey,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      return { success: true, message: "Connected to Riven" };
    }

    return {
      success: false,
      message: `Riven returned ${response.status}: ${response.statusText}`,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Network error";
    return { success: false, message };
  }
}

export async function saveRivenConfig(config: RivenConfig) {
  return storeRivenConfig(config);
}

export async function disconnectRiven() {
  return clearStoredRivenConfig();
}
```

- [ ] **Step 3: Create `app/api/config/riven/route.ts`**

```typescript
import { NextResponse } from "next/server";

export async function GET() {
  const envApiUrl = process.env.RIVEN_API_URL || null;
  const hasEnvConfig = !!(envApiUrl && process.env.RIVEN_API_KEY);

  return NextResponse.json({ hasEnvConfig, envApiUrl });
}
```

- [ ] **Step 4: Commit**

```bash
git add src/actions/store/server-actions.ts src/actions/riven.ts app/api/config/riven/route.ts
git commit -m "feat: add Riven config storage and resolution with ENV fallback"
```

---

## Task 4: Add Riven API proxy

**Files:**
- Create: `app/api/riven/[...slug]/route.ts`

- [ ] **Step 1: Create the proxy route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { resolveRivenConfig } from "@/src/actions/riven";
import { getAuthData } from "@/src/actions/store/server-actions";

async function isAdminUser(): Promise<boolean> {
  try {
    const authData = await getAuthData();
    const user = authData?.user as any;
    return Boolean(
      user?.Policy?.IsAdministrator || user?.User?.Policy?.IsAdministrator,
    );
  } catch {
    return false;
  }
}

async function proxyToRiven(
  req: NextRequest,
  slug: string[],
  method: string,
): Promise<NextResponse> {
  const config = await resolveRivenConfig();
  if (!config) {
    return NextResponse.json(
      { success: false, message: "Riven is not configured" },
      { status: 503 },
    );
  }

  // Non-admin users can only perform GET requests
  if (method !== "GET") {
    const admin = await isAdminUser();
    if (!admin) {
      return NextResponse.json(
        { success: false, message: "Admin access required" },
        { status: 403 },
      );
    }
  }

  const baseUrl = config.apiUrl.replace(/\/+$/, "");
  const path = slug.join("/");
  const url = new URL(req.url);
  const queryString = url.searchParams.toString();
  const fullUrl = `${baseUrl}/api/v1/${path}${queryString ? `?${queryString}` : ""}`;

  try {
    const fetchOptions: RequestInit = {
      method,
      headers: {
        "x-api-key": config.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15000),
    };

    if (method !== "GET" && method !== "HEAD") {
      try {
        const body = await req.text();
        if (body) {
          fetchOptions.body = body;
        }
      } catch {
        // No body — that's fine for some POST/DELETE requests
      }
    }

    const response = await fetch(fullUrl, fetchOptions);

    if (response.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Network error";
    return NextResponse.json(
      { success: false, message: `Riven server unreachable: ${message}` },
      { status: 502 },
    );
  }
}

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await props.params;
  return proxyToRiven(req, slug, "GET");
}

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await props.params;
  return proxyToRiven(req, slug, "POST");
}

export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await props.params;
  return proxyToRiven(req, slug, "DELETE");
}

export async function PUT(
  req: NextRequest,
  props: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await props.params;
  return proxyToRiven(req, slug, "PUT");
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/riven/
git commit -m "feat: add Riven API proxy with admin-gated mutations"
```

---

## Task 5: Add RivenProvider context

**Files:**
- Create: `src/contexts/riven-context.tsx`
- Modify: `app/(main)/layout.tsx`

- [ ] **Step 1: Create `src/contexts/riven-context.tsx`**

```tsx
"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
} from "react";

interface RivenContextType {
  isConnected: boolean;
  isLoading: boolean;
  connectionError: string | null;
}

const RivenContext = createContext<RivenContextType | undefined>(undefined);

export function RivenProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkConnection() {
      try {
        const response = await fetch("/api/riven/health");
        if (cancelled) return;

        if (response.ok) {
          setIsConnected(true);
          setConnectionError(null);
        } else if (response.status === 503) {
          // Not configured
          setIsConnected(false);
          setConnectionError(null);
        } else {
          setIsConnected(false);
          const data = await response.json().catch(() => null);
          setConnectionError(data?.message || `Status ${response.status}`);
        }
      } catch (error) {
        if (cancelled) return;
        setIsConnected(false);
        setConnectionError(
          error instanceof Error ? error.message : "Connection check failed",
        );
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    checkConnection();

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({ isConnected, isLoading, connectionError }),
    [isConnected, isLoading, connectionError],
  );

  return (
    <RivenContext.Provider value={value}>{children}</RivenContext.Provider>
  );
}

export function useRiven() {
  const context = useContext(RivenContext);
  if (context === undefined) {
    throw new Error("useRiven must be used within a RivenProvider");
  }
  return context;
}
```

- [ ] **Step 2: Add RivenProvider to main layout**

In `app/(main)/layout.tsx`, add import and wrap:

```tsx
import { RivenProvider } from "@/src/contexts/riven-context";
```

The return becomes:

```tsx
return (
  <JotaiProvider>
    <PlaybackProvider>
      <RivenProvider>
        <FullscreenDetector />
        <AuthErrorHandler>
          <LayoutContent>{children}</LayoutContent>
        </AuthErrorHandler>
      </RivenProvider>
    </PlaybackProvider>
  </JotaiProvider>
);
```

- [ ] **Step 3: Commit**

```bash
git add src/contexts/riven-context.tsx app/\(main\)/layout.tsx
git commit -m "feat: add RivenProvider context with connection health check"
```

---

## Task 6: Add admin-only Riven settings section

**Files:**
- Create: `src/components/settings/riven-section.tsx`
- Modify: `app/(main)/settings/page.tsx`

- [ ] **Step 1: Create `src/components/settings/riven-section.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  Key,
  Loader2,
  Save,
  Server,
  Unplug,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/src/components/ui/collapsible";
import { Label } from "@/src/components/ui/label";
import { Input } from "@/src/components/ui/input";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/lib/utils";
import { toast } from "sonner";
import {
  testRivenConnection,
  saveRivenConfig,
  disconnectRiven,
  resolveRivenConfig,
} from "@/src/actions/riven";
import { getUser } from "@/src/actions";

export default function RivenSection() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasEnvConfig, setHasEnvConfig] = useState(false);
  const [envApiUrl, setEnvApiUrl] = useState<string | null>(null);

  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");

  const loadState = useCallback(async () => {
    try {
      const [user, config, envResponse] = await Promise.all([
        getUser(),
        resolveRivenConfig(),
        fetch("/api/config/riven").then((r) => r.json()),
      ]);

      const admin = Boolean(
        (user as any)?.Policy?.IsAdministrator,
      );
      setIsAdmin(admin);

      if (!admin) return;

      setHasEnvConfig(envResponse.hasEnvConfig || false);
      setEnvApiUrl(envResponse.envApiUrl || null);

      if (config) {
        setApiUrl(config.apiUrl);
        // Don't pre-fill API key from resolved config for security
        // But test connection to show status
        const result = await testRivenConnection(config);
        setIsConnected(result.success);
      }
    } catch (error) {
      console.error("Failed to load Riven settings:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  if (!isAdmin) return null;

  const handleTestAndSave = async () => {
    if (!apiUrl) {
      toast.error("Enter a Riven API URL");
      return;
    }
    if (!apiKey) {
      toast.error("Enter a Riven API key");
      return;
    }

    setIsTesting(true);
    const toastId = toast.loading("Testing connection...");

    try {
      const config = { apiUrl, apiKey };
      const result = await testRivenConnection(config);

      if (result.success) {
        await saveRivenConfig(config);
        setIsConnected(true);
        toast.success("Connected to Riven", { id: toastId });
      } else {
        setIsConnected(false);
        toast.error(result.message || "Connection failed", { id: toastId });
      }
    } catch (error) {
      toast.error("Unexpected error", { id: toastId });
    } finally {
      setIsTesting(false);
    }
  };

  const handleDisconnect = async () => {
    await disconnectRiven();
    setApiUrl(envApiUrl || "");
    setApiKey("");
    setIsConnected(false);
    toast.success("Riven configuration cleared");

    // Re-check if ENV config still connects
    if (hasEnvConfig) {
      const result = await testRivenConnection();
      setIsConnected(result.success);
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="bg-card/80 backdrop-blur">
        <CollapsibleTrigger asChild>
          <CardHeader className="flex flex-wrap items-start justify-between gap-3 cursor-pointer">
            <CardTitle className="flex items-center gap-2 font-poppins text-lg">
              <Server className="h-5 w-5" />
              Riven
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {!isLoading && isConnected && (
                <div className="flex items-center gap-1.5 rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-medium text-green-500 ring-1 ring-inset ring-green-500/20">
                  <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                  Connected
                </div>
              )}
            </CardTitle>
            <button
              type="button"
              aria-expanded={isOpen}
              className="inline-flex items-center gap-1 rounded-full border border-border/60 px-3 py-1 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
            >
              {isOpen ? "Hide" : "Show"}
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform duration-200",
                  isOpen ? "rotate-180" : "rotate-0",
                )}
              />
            </button>
            <CardDescription className="w-full">
              Connect to your Riven instance for media library management.
            </CardDescription>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-up data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-down">
          <CardContent className="space-y-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-4 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading settings...
              </div>
            ) : isConnected ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10">
                      <Server className="h-5 w-5 text-green-500" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-medium text-foreground">
                        Connected to Riven
                      </h4>
                      <p className="text-xs text-muted-foreground break-all">
                        {apiUrl}
                      </p>
                      {hasEnvConfig && (
                        <p className="text-xs text-muted-foreground/60 mt-0.5">
                          Configured via environment
                        </p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={handleDisconnect}
                    >
                      <Unplug className="h-3.5 w-3.5 mr-1" />
                      Disconnect
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {hasEnvConfig && (
                  <p className="text-xs text-muted-foreground">
                    Environment variables detected ({envApiUrl}). Enter values below to override.
                  </p>
                )}

                <div className="space-y-2">
                  <Label htmlFor="riven-url">API URL</Label>
                  <div className="relative">
                    <Server className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="riven-url"
                      placeholder={envApiUrl || "http://riven:8080"}
                      className="pl-9 bg-background/50"
                      value={apiUrl}
                      onChange={(e) => setApiUrl(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="riven-key">API Key</Label>
                  <div className="relative">
                    <Key className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="riven-key"
                      type="password"
                      placeholder="Your Riven API key"
                      className="pl-9 bg-background/50"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    size="sm"
                    className="w-full gap-2 sm:w-auto"
                    onClick={handleTestAndSave}
                    disabled={isTesting}
                  >
                    {isTesting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Test & Save
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
```

- [ ] **Step 2: Update `settings/page.tsx` to use RivenSection**

```tsx
import { AuroraBackground } from "@/src/components/aurora-background";
import { SearchBar } from "@/src/components/search-component";
import { Settings2 } from "lucide-react";
import RivenSection from "@/src/components/settings/riven-section";
import ProfileSection from "@/src/components/settings/profile-section";
import ThemeSection from "@/src/components/settings/theme-section";
import UserPreferenceSection from "@/src/components/settings/user-preference-section";

export default function SettingsPage() {
  return (
    <div className="relative px-4 py-3 max-w-full overflow-hidden">
      <AuroraBackground />
      <div className="relative z-10">
        <div className="mb-6">
          <SearchBar />
        </div>

        <div className="mb-8">
          <h2 className="text-3xl font-semibold text-foreground mb-2 font-poppins flex items-center gap-2">
            <Settings2 className="h-8 w-8" />
            Settings
          </h2>
          <p className="text-muted-foreground">
            Customize the interface and preview upcoming dashboard themes.
          </p>
        </div>

        <div className="grid gap-6">
          <ProfileSection />
          <RivenSection />
          <UserPreferenceSection />
          <ThemeSection />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/riven-section.tsx app/\(main\)/settings/page.tsx
git commit -m "feat: add admin-only Riven settings section"
```

---

## Task 7: Final verification

- [ ] **Step 1: Build the project**

```bash
bun run build
```

Expected: Clean build with no errors.

- [ ] **Step 2: Check for any remaining Seerr references**

```bash
grep -ri "seerr\|overseerr\|jellyseerr" --include="*.ts" --include="*.tsx" --include="*.json" src/ app/ | grep -v node_modules | grep -v ".local/"
```

Expected: No matches (or only in package-lock / unrelated comments).

- [ ] **Step 3: Commit any remaining fixes and tag completion**

```bash
git add -A
git commit -m "chore: verify clean Seerr removal and Riven integration"
```

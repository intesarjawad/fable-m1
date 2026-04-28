"use server";

import { getAuthData } from "./media";

export interface CastTarget {
  sessionId: string;
  deviceId: string;
  deviceName: string;
  client: string;
  userName?: string;
  nowPlayingItemName?: string;
  isActive: boolean;
}

interface JellyfinSessionInfo {
  Id?: string;
  DeviceId?: string;
  DeviceName?: string;
  Client?: string;
  UserName?: string;
  SupportsRemoteControl?: boolean;
  SupportsMediaControl?: boolean;
  PlayableMediaTypes?: string[];
  NowPlayingItem?: { Name?: string };
  IsActive?: boolean;
}

interface ResolvedAuth {
  serverUrl: string;
  accessToken: string;
  userId: string;
}

async function resolveCastAuth(): Promise<ResolvedAuth | null> {
  try {
    const { serverUrl, user } = await getAuthData();
    if (!user.AccessToken || !user.Id) return null;
    return {
      serverUrl: serverUrl.replace(/\/+$/, ""),
      accessToken: user.AccessToken,
      userId: user.Id,
    };
  } catch {
    return null;
  }
}

export async function listCastTargets(): Promise<{
  success: boolean;
  targets: CastTarget[];
  message?: string;
}> {
  const auth = await resolveCastAuth();
  if (!auth) {
    return { success: false, targets: [], message: "Sign in to cast" };
  }

  const url = `${auth.serverUrl}/Sessions?controllableByUserId=${encodeURIComponent(auth.userId)}`;
  console.log("[cast/list] GET", url);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "X-Emby-Token": auth.accessToken,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(
        `[cast/list] ${res.status} ${res.statusText} — ${body.slice(0, 300)}`,
      );
      return { success: false, targets: [], message: "Couldn't load devices" };
    }
    const sessions = (await res.json()) as JellyfinSessionInfo[];

    const targets: CastTarget[] = sessions
      .filter(
        (session) =>
          !!session.Id &&
          !!session.DeviceId &&
          (session.SupportsMediaControl ?? session.SupportsRemoteControl ?? false) &&
          (session.PlayableMediaTypes ?? []).some(
            (mediaType) => mediaType.toLowerCase() === "video",
          ),
      )
      .map((session) => ({
        sessionId: session.Id!,
        deviceId: session.DeviceId!,
        deviceName: session.DeviceName ?? "Unknown device",
        client: session.Client ?? "Unknown client",
        userName: session.UserName,
        nowPlayingItemName: session.NowPlayingItem?.Name,
        isActive: session.IsActive ?? true,
      }));

    console.log(`[cast/list] OK — ${targets.length} controllable target(s)`);
    return { success: true, targets };
  } catch (error) {
    console.error("[cast/list] fetch threw:", error);
    return { success: false, targets: [], message: "Couldn't load devices" };
  }
}

export async function castPlayNow(input: {
  sessionId: string;
  itemId: string;
  startPositionTicks?: number;
}): Promise<{ success: boolean; message?: string }> {
  const auth = await resolveCastAuth();
  if (!auth) {
    return { success: false, message: "Sign in to cast" };
  }

  const search = new URLSearchParams({
    playCommand: "PlayNow",
    itemIds: input.itemId,
  });
  if (typeof input.startPositionTicks === "number") {
    search.set("startPositionTicks", String(input.startPositionTicks));
  }

  const url = `${auth.serverUrl}/Sessions/${encodeURIComponent(
    input.sessionId,
  )}/Playing?${search.toString()}`;
  console.log("[cast/play] POST", url);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "X-Emby-Token": auth.accessToken,
        "Content-Length": "0",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 204 || res.ok) {
      console.log(`[cast/play] OK ${res.status}`);
      return { success: true };
    }
    const body = await res.text().catch(() => "");
    console.error(
      `[cast/play] ${res.status} ${res.statusText} — ${body.slice(0, 300)}`,
    );
    return { success: false, message: "Couldn't reach the device" };
  } catch (error) {
    console.error("[cast/play] fetch threw:", error);
    return { success: false, message: "Couldn't reach the device" };
  }
}

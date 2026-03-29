"use server";

import { StoreAuthData } from "./store/store-auth-data";

async function getAuth() {
  const authData = await StoreAuthData.get();
  if (!authData) {
    console.error("[SyncPlay] getAuth: no auth data in cookie");
    throw new Error("Not authenticated");
  }
  const token = (authData.user as any)?.AccessToken;
  if (!token) {
    console.error("[SyncPlay] getAuth: no access token in auth data");
    throw new Error("No access token");
  }
  return { serverUrl: authData.serverUrl, token };
}

async function syncPlayFetch(
  path: string,
  options: { method?: string; body?: any } = {},
) {
  const { serverUrl, token } = await getAuth();
  const baseUrl = serverUrl.replace(/\/+$/, "");

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || "POST",
    headers: {
      Authorization: `MediaBrowser Token="${token}"`,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error(`[SyncPlay] ${path} failed: ${response.status} ${errorText}`);
    throw new Error(`SyncPlay ${path}: ${response.status} ${errorText}`);
  }

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  if (!text || text.length === 0) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Group management
export async function syncPlayCreateGroup(groupName: string) {
  return syncPlayFetch("/SyncPlay/New", { body: { GroupName: groupName } });
}

export async function syncPlayJoinGroup(groupId: string) {
  return syncPlayFetch("/SyncPlay/Join", { body: { GroupId: groupId } });
}

export async function syncPlayLeaveGroup() {
  return syncPlayFetch("/SyncPlay/Leave");
}

export async function syncPlayGetGroups() {
  return syncPlayFetch("/SyncPlay/List", { method: "GET" });
}

// Playback control
export async function syncPlayUnpause() {
  return syncPlayFetch("/SyncPlay/Unpause");
}

export async function syncPlayPause() {
  return syncPlayFetch("/SyncPlay/Pause");
}

export async function syncPlaySeek(positionTicks: number) {
  // Jellyfin expects PositionTicks as an integer
  const ticks = Math.round(positionTicks);
  return syncPlayFetch("/SyncPlay/Seek", { body: { PositionTicks: ticks } });
}

export async function syncPlayStop() {
  return syncPlayFetch("/SyncPlay/Stop");
}

// Queue management
export async function syncPlaySetNewQueue(
  playingQueue: string[],
  playingItemPosition: number = 0,
  startPositionTicks: number = 0,
) {
  return syncPlayFetch("/SyncPlay/SetNewQueue", {
    body: {
      PlayingQueue: playingQueue,
      PlayingItemPosition: playingItemPosition,
      StartPositionTicks: startPositionTicks,
    },
  });
}

export async function syncPlayNextItem(playlistItemId: string) {
  return syncPlayFetch("/SyncPlay/NextItem", {
    body: { PlaylistItemId: playlistItemId },
  });
}

export async function syncPlayPreviousItem(playlistItemId: string) {
  return syncPlayFetch("/SyncPlay/PreviousItem", {
    body: { PlaylistItemId: playlistItemId },
  });
}

// Time sync
export async function getServerTime(): Promise<{
  RequestReceptionTime: string;
  ResponseTransmissionTime: string;
}> {
  return syncPlayFetch("/GetUTCTime", { method: "GET" });
}

// Sync state
export async function syncPlayPing(ping: number) {
  return syncPlayFetch("/SyncPlay/Ping", { body: { Ping: ping } });
}

export async function syncPlayBuffering(options: {
  When: string;
  PositionTicks: number;
  IsPlaying: boolean;
  PlaylistItemId: string;
}) {
  return syncPlayFetch("/SyncPlay/Buffering", { body: options });
}

export async function syncPlayReady(options: {
  When: string;
  PositionTicks: number;
  IsPlaying: boolean;
  PlaylistItemId: string;
}) {
  return syncPlayFetch("/SyncPlay/Ready", { body: options });
}

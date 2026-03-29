"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { jellyfinWs } from "@/src/lib/jellyfin-ws";
import { usePlaybackContext } from "@/src/playback/context/PlaybackContext";
import { useAuth } from "@/src/hooks/useAuth";
import { getDeviceId } from "@/src/lib/device-id";
import { StoreAuthData } from "@/src/actions/store/store-auth-data";
import { fetchMediaDetails } from "@/src/actions";
import { toast } from "sonner";

interface GroupInfoDto {
  GroupId?: string;
  GroupName?: string;
  State?: string;
  Participants?: string[];
  LastUpdatedAt?: string;
}

interface SyncPlayContextType {
  isInGroup: boolean;
  currentGroup: GroupInfoDto | null;
  availableGroups: GroupInfoDto[];
  error: string | null;

  createGroup: (groupName: string) => Promise<void>;
  joinGroup: (groupId: string) => Promise<void>;
  leaveGroup: () => Promise<void>;
  refreshGroups: () => Promise<void>;

  syncPlay: () => Promise<void>;
  syncPause: () => Promise<void>;
  syncSeek: (positionTicks: number) => Promise<void>;
  syncStop: () => Promise<void>;
  syncNext: () => Promise<void>;
  syncPrevious: () => Promise<void>;

  setQueue: (itemIds: string[], startIndex?: number) => Promise<void>;
}

const SyncPlayContext = createContext<SyncPlayContextType | undefined>(
  undefined,
);

// Direct fetch helper for Jellyfin SyncPlay API
async function jellyfinFetch(
  serverUrl: string,
  token: string,
  path: string,
  options: { method?: string; body?: any } = {},
) {
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
    throw new Error(`Jellyfin ${path}: ${response.status} ${response.statusText}`);
  }
  // Some endpoints return 204 No Content
  if (response.status === 204 || response.headers.get("content-length") === "0") {
    return null;
  }
  return response.json();
}

export function SyncPlayProvider({ children }: { children: React.ReactNode }) {
  const manager = usePlaybackContext();
  const { serverUrl, user, isAuthenticated } = useAuth();
  const token = (user as any)?.AccessToken;

  const [isInGroup, setIsInGroup] = useState(false);
  const [currentGroup, setCurrentGroup] = useState<GroupInfoDto | null>(null);
  const [availableGroups, setAvailableGroups] = useState<GroupInfoDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  const serverCommandInFlight = useRef(false);
  const playingItemIdRef = useRef<string | null>(null);
  const serverTimeOffset = useRef(0);
  const pingTimestamps = useRef<number[]>([]);

  // Stable refs for serverUrl/token so callbacks don't go stale
  const serverUrlRef = useRef(serverUrl);
  const tokenRef = useRef(token);
  useEffect(() => {
    serverUrlRef.current = serverUrl;
    tokenRef.current = token;
  }, [serverUrl, token]);

  // Helper that uses current refs
  const syncFetch = useCallback(
    (path: string, options: { method?: string; body?: any } = {}) => {
      if (!serverUrlRef.current || !tokenRef.current) {
        return Promise.reject(new Error("Not authenticated"));
      }
      return jellyfinFetch(serverUrlRef.current, tokenRef.current, path, options);
    },
    [],
  );

  // Connect WebSocket when authenticated
  useEffect(() => {
    if (!isAuthenticated || !serverUrl || !token) return;

    const deviceId = getDeviceId();
    if (deviceId) {
      jellyfinWs.connect(serverUrl, token, deviceId);
    }

    return () => {
      jellyfinWs.disconnect();
    };
  }, [isAuthenticated, serverUrl, token]);

  // WebSocket subscription — set up after handlers are defined (see below)

  // Poll for available groups when not in a group
  useEffect(() => {
    if (isInGroup || !isAuthenticated || !serverUrl || !token) return;

    const pollGroups = async () => {
      try {
        const groups = await syncFetch("/SyncPlay/List", { method: "GET" });
        setAvailableGroups(groups || []);
      } catch {
        // Silent fail on poll
      }
    };

    pollGroups();
    const interval = setInterval(pollGroups, 15000);
    return () => clearInterval(interval);
  }, [isInGroup, isAuthenticated, serverUrl, token, syncFetch]);

  // Ping interval when in group
  useEffect(() => {
    if (!isInGroup) return;

    const pingInterval = setInterval(async () => {
      try {
        const sendTime = Date.now();
        await syncFetch("/SyncPlay/Ping", {
          body: { Ping: Math.round(serverTimeOffset.current) },
        });
        const roundTrip = Date.now() - sendTime;
        pingTimestamps.current.push(roundTrip);
        if (pingTimestamps.current.length > 5) {
          pingTimestamps.current.shift();
        }
      } catch {
        // Silent fail
      }
    }, 10000);

    return () => clearInterval(pingInterval);
  }, [isInGroup, syncFetch]);

  // Report buffering state
  useEffect(() => {
    if (!isInGroup || !manager) return;

    const { isBuffering, currentTime, paused, currentItem } =
      manager.playbackState;

    const requestBody = {
      When: new Date().toISOString(),
      PositionTicks: Math.round(currentTime * 10000000),
      IsPlaying: !paused,
      PlaylistItemId: currentItem?.Id || "",
    };

    if (isBuffering) {
      syncFetch("/SyncPlay/Buffering", { body: requestBody }).catch(() => {});
    } else {
      syncFetch("/SyncPlay/Ready", { body: requestBody }).catch(() => {});
    }
  }, [isInGroup, manager?.playbackState?.isBuffering]);

  const handleSyncPlayCommand = useCallback(
    (data: any) => {
      if (!manager) return;

      const { Command, PositionTicks, When } = data;

      const executeCommand = () => {
        serverCommandInFlight.current = true;
        try {
          switch (Command) {
            case "Unpause":
              manager.unpause();
              break;
            case "Pause":
              manager.pause();
              break;
            case "Stop":
              manager.stop();
              break;
            case "Seek":
              if (PositionTicks != null) {
                manager.seek(PositionTicks);
              }
              break;
          }
        } finally {
          serverCommandInFlight.current = false;
        }
      };

      if (When && (Command === "Unpause" || Command === "Seek")) {
        const targetTime = new Date(When).getTime();
        const adjustedNow = Date.now() + serverTimeOffset.current;
        const delay = Math.max(0, targetTime - adjustedNow);

        if (delay > 0) {
          setTimeout(executeCommand, delay);
        } else {
          executeCommand();
        }
      } else {
        executeCommand();
      }
    },
    [manager],
  );

  const handleGroupUpdate = useCallback(
    async (data: any) => {
      const { Type, Data } = data;

      switch (Type) {
        case "GroupJoined":
          setIsInGroup(true);
          setCurrentGroup(Data);
          setError(null);
          toast.success(`Joined: ${Data?.GroupName || "Watch Party"}`);
          break;

        case "GroupLeft":
          setIsInGroup(false);
          setCurrentGroup(null);
          toast.info("Left watch party");
          break;

        case "UserJoined":
          setCurrentGroup((prev) => {
            if (!prev) return prev;
            const participants = [...(prev.Participants || [])];
            if (!participants.includes(Data)) {
              participants.push(Data);
            }
            return { ...prev, Participants: participants };
          });
          break;

        case "UserLeft":
          setCurrentGroup((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              Participants: (prev.Participants || []).filter(
                (p) => p !== Data,
              ),
            };
          });
          break;

        case "PlayQueue": {
          if (!manager) break;
          const { Playlist, PlayingItemIndex, StartPositionTicks } = Data;
          if (Playlist?.length > 0 && PlayingItemIndex != null) {
            const currentItemId = Playlist[PlayingItemIndex]?.ItemId;
            if (
              !currentItemId ||
              currentItemId === playingItemIdRef.current ||
              currentItemId === manager.playbackState.currentItem?.Id
            ) {
              break;
            }
            playingItemIdRef.current = currentItemId;
            try {
              const itemDetails = await fetchMediaDetails(currentItemId);
              if (itemDetails) {
                serverCommandInFlight.current = true;
                try {
                  await manager.play(itemDetails as any, {
                    startPositionTicks: StartPositionTicks || 0,
                  });
                } finally {
                  serverCommandInFlight.current = false;
                }
              }
            } catch (err) {
              console.error("Failed to start SyncPlay queue item:", err);
            }
          }
          break;
        }

        case "StateUpdate":
          setCurrentGroup((prev) =>
            prev ? { ...prev, State: Data?.State } : prev,
          );
          break;

        case "NotInGroup":
        case "GroupDoesNotExist":
          setIsInGroup(false);
          setCurrentGroup(null);
          setError("Group no longer exists");
          toast.error("Watch party ended");
          break;
      }
    },
    [manager],
  );

  // Keep handler refs current to avoid stale closures in WebSocket subscriptions
  const handleCommandRef = useRef(handleSyncPlayCommand);
  const handleUpdateRef = useRef(handleGroupUpdate);
  useEffect(() => {
    handleCommandRef.current = handleSyncPlayCommand;
    handleUpdateRef.current = handleGroupUpdate;
  }, [handleSyncPlayCommand, handleGroupUpdate]);

  // Subscribe to SyncPlay WebSocket messages
  useEffect(() => {
    const unsubCommand = jellyfinWs.subscribe(
      "SyncPlayCommand",
      (data: any) => {
        console.log("[SyncPlay] Command received:", data);
        handleCommandRef.current(data);
      },
    );

    const unsubGroupUpdate = jellyfinWs.subscribe(
      "SyncPlayGroupUpdate",
      (data: any) => {
        console.log("[SyncPlay] GroupUpdate received:", data);
        handleUpdateRef.current(data);
      },
    );

    return () => {
      unsubCommand();
      unsubGroupUpdate();
    };
  }, []);

  // --- Public actions ---

  const createGroup = useCallback(async (groupName: string) => {
    try {
      console.log("[SyncPlay] Creating group:", groupName);
      await syncFetch("/SyncPlay/New", { body: { GroupName: groupName } });
      console.log("[SyncPlay] Group created successfully");
      setError(null);
    } catch (err) {
      console.error("[SyncPlay] Failed to create group:", err);
      setError("Failed to create group");
      toast.error("Failed to create group");
    }
  }, [syncFetch]);

  const joinGroup = useCallback(async (groupId: string) => {
    try {
      await syncFetch("/SyncPlay/Join", { body: { GroupId: groupId } });
      setError(null);
    } catch (err) {
      setError("Failed to join group");
      toast.error("Failed to join group");
    }
  }, [syncFetch]);

  const leaveGroup = useCallback(async () => {
    try {
      await syncFetch("/SyncPlay/Leave");
      setIsInGroup(false);
      setCurrentGroup(null);
      playingItemIdRef.current = null;
      setError(null);
    } catch (err) {
      setError("Failed to leave group");
      toast.error("Failed to leave group");
    }
  }, [syncFetch]);

  const refreshGroups = useCallback(async () => {
    try {
      const groups = await syncFetch("/SyncPlay/List", { method: "GET" });
      console.log("[SyncPlay] Available groups:", groups);
      setAvailableGroups(groups || []);
    } catch (err) {
      console.error("[SyncPlay] Failed to fetch groups:", err);
    }
  }, [syncFetch]);

  const syncPlay = useCallback(async () => {
    if (serverCommandInFlight.current) return;
    try {
      await syncFetch("/SyncPlay/Unpause");
    } catch {
      toast.error("SyncPlay: failed to play");
    }
  }, [syncFetch]);

  const syncPause = useCallback(async () => {
    if (serverCommandInFlight.current) return;
    try {
      await syncFetch("/SyncPlay/Pause");
    } catch {
      toast.error("SyncPlay: failed to pause");
    }
  }, [syncFetch]);

  const syncSeek = useCallback(async (positionTicks: number) => {
    if (serverCommandInFlight.current) return;
    try {
      await syncFetch("/SyncPlay/Seek", {
        body: { PositionTicks: positionTicks },
      });
    } catch {
      toast.error("SyncPlay: failed to seek");
    }
  }, [syncFetch]);

  const syncStop = useCallback(async () => {
    if (serverCommandInFlight.current) return;
    try {
      await syncFetch("/SyncPlay/Stop");
    } catch {
      toast.error("SyncPlay: failed to stop");
    }
  }, [syncFetch]);

  const syncNext = useCallback(async () => {
    if (serverCommandInFlight.current) return;
    try {
      await syncFetch("/SyncPlay/NextItem", {
        body: { PlaylistItemId: manager?.playbackState?.currentItem?.Id || "" },
      });
    } catch {
      toast.error("SyncPlay: failed to skip");
    }
  }, [syncFetch, manager]);

  const syncPrevious = useCallback(async () => {
    if (serverCommandInFlight.current) return;
    try {
      await syncFetch("/SyncPlay/PreviousItem", {
        body: { PlaylistItemId: manager?.playbackState?.currentItem?.Id || "" },
      });
    } catch {
      toast.error("SyncPlay: failed to go back");
    }
  }, [syncFetch, manager]);

  const setQueue = useCallback(
    async (itemIds: string[], startIndex: number = 0) => {
      try {
        if (itemIds.length > 0) {
          playingItemIdRef.current = itemIds[startIndex] || itemIds[0];
        }
        await syncFetch("/SyncPlay/SetNewQueue", {
          body: {
            PlayingQueue: itemIds,
            PlayingItemPosition: startIndex,
            StartPositionTicks: 0,
          },
        });
      } catch {
        toast.error("SyncPlay: failed to set queue");
      }
    },
    [syncFetch],
  );

  const value = useMemo(
    () => ({
      isInGroup,
      currentGroup,
      availableGroups,
      error,
      createGroup,
      joinGroup,
      leaveGroup,
      refreshGroups,
      syncPlay,
      syncPause,
      syncSeek,
      syncStop,
      syncNext,
      syncPrevious,
      setQueue,
    }),
    [
      isInGroup,
      currentGroup,
      availableGroups,
      error,
      createGroup,
      joinGroup,
      leaveGroup,
      refreshGroups,
      syncPlay,
      syncPause,
      syncSeek,
      syncStop,
      syncNext,
      syncPrevious,
      setQueue,
    ],
  );

  return (
    <SyncPlayContext.Provider value={value}>
      {children}
    </SyncPlayContext.Provider>
  );
}

const noopAsync = async () => {};

const defaultSyncPlayContext: SyncPlayContextType = {
  isInGroup: false,
  currentGroup: null,
  availableGroups: [],
  error: null,
  createGroup: noopAsync,
  joinGroup: noopAsync,
  leaveGroup: noopAsync,
  refreshGroups: noopAsync,
  syncPlay: noopAsync,
  syncPause: noopAsync,
  syncSeek: noopAsync,
  syncStop: noopAsync,
  syncNext: noopAsync,
  syncPrevious: noopAsync,
  setQueue: noopAsync,
};

export function useSyncPlay() {
  const context = useContext(SyncPlayContext);
  if (context === undefined) {
    return defaultSyncPlayContext;
  }
  return context;
}

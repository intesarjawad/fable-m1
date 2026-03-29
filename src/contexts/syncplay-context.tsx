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
import { fetchMediaDetails } from "@/src/actions";
import {
  syncPlayCreateGroup as apiCreateGroup,
  syncPlayJoinGroup as apiJoinGroup,
  syncPlayLeaveGroup as apiLeaveGroup,
  syncPlayGetGroups as apiGetGroups,
  syncPlayUnpause as apiUnpause,
  syncPlayPause as apiPause,
  syncPlaySeek as apiSeek,
  syncPlayStop as apiStop,
  syncPlaySetNewQueue as apiSetNewQueue,
  syncPlayNextItem as apiNextItem,
  syncPlayPreviousItem as apiPreviousItem,
  syncPlayPing as apiPing,
  syncPlayBuffering as apiBuffering,
  syncPlayReady as apiReady,
} from "@/src/actions/syncplay";
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
  const groupJoinedAt = useRef<number>(0);

  // Connect WebSocket when authenticated (WebSocket is not subject to CORS)
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

  // --- Command handlers ---

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
              // Server sends Stop immediately after group creation (empty queue).
              // Ignore Stop commands within 5s of joining to avoid killing playback.
              if (Date.now() - groupJoinedAt.current < 5000) {
                // Ignore — server sends Stop on empty queue during group setup
                break;
              }
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
          groupJoinedAt.current = Date.now();
          setIsInGroup(true);
          setCurrentGroup(Data);
          setError(null);
          toast.success(`Joined: ${Data?.GroupName || "Watch Party"}`);
          break;

        case "GroupLeft":
          setIsInGroup(false);
          setCurrentGroup(null);
          playingItemIdRef.current = null;
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

  // --- WebSocket subscriptions (use refs to avoid stale closures) ---

  const handleCommandRef = useRef(handleSyncPlayCommand);
  const handleUpdateRef = useRef(handleGroupUpdate);
  useEffect(() => {
    handleCommandRef.current = handleSyncPlayCommand;
    handleUpdateRef.current = handleGroupUpdate;
  }, [handleSyncPlayCommand, handleGroupUpdate]);

  useEffect(() => {
    const unsubCommand = jellyfinWs.subscribe(
      "SyncPlayCommand",
      (data: any) => {
        handleCommandRef.current(data);
      },
    );
    const unsubGroupUpdate = jellyfinWs.subscribe(
      "SyncPlayGroupUpdate",
      (data: any) => {
        handleUpdateRef.current(data);
      },
    );
    return () => {
      unsubCommand();
      unsubGroupUpdate();
    };
  }, []);

  // --- Polling for groups when not in one ---

  useEffect(() => {
    if (isInGroup || !isAuthenticated) return;

    const pollGroups = async () => {
      try {
        const groups = await apiGetGroups();
        setAvailableGroups(groups || []);
      } catch {
        // Silent fail
      }
    };

    pollGroups();
    const interval = setInterval(pollGroups, 15000);
    return () => clearInterval(interval);
  }, [isInGroup, isAuthenticated]);

  // --- Ping when in group ---

  useEffect(() => {
    if (!isInGroup) return;

    const pingInterval = setInterval(async () => {
      try {
        await apiPing(Math.round(serverTimeOffset.current));
      } catch {
        // Silent fail
      }
    }, 10000);

    return () => clearInterval(pingInterval);
  }, [isInGroup]);

  // --- Report buffering state ---

  useEffect(() => {
    if (!isInGroup || !manager) return;

    const { isBuffering, currentTime, paused, currentItem } =
      manager.playbackState;

    const options = {
      When: new Date().toISOString(),
      PositionTicks: Math.round(currentTime * 10000000),
      IsPlaying: !paused,
      PlaylistItemId: currentItem?.Id || "",
    };

    if (isBuffering) {
      apiBuffering(options).catch(() => {});
    } else {
      apiReady(options).catch(() => {});
    }
  }, [isInGroup, manager?.playbackState?.isBuffering]);

  // --- Public actions (all go through server actions) ---

  const createGroup = useCallback(async (groupName: string) => {
    try {
      await apiCreateGroup(groupName);
      setError(null);
    } catch (err) {
      console.error("[SyncPlay] Failed to create group:", err);
      setError("Failed to create group");
      toast.error("Failed to create group");
    }
  }, []);

  const joinGroup = useCallback(async (groupId: string) => {
    try {
      await apiJoinGroup(groupId);
      setError(null);
    } catch (err) {
      console.error("[SyncPlay] Failed to join group:", err);
      setError("Failed to join group");
      toast.error("Failed to join group");
    }
  }, []);

  const leaveGroup = useCallback(async () => {
    try {
      await apiLeaveGroup();
      setIsInGroup(false);
      setCurrentGroup(null);
      playingItemIdRef.current = null;
      setError(null);
    } catch (err) {
      console.error("[SyncPlay] Failed to leave group:", err);
      setError("Failed to leave group");
      toast.error("Failed to leave group");
    }
  }, []);

  const refreshGroups = useCallback(async () => {
    try {
      const groups = await apiGetGroups();
      setAvailableGroups(groups || []);
    } catch {
      // Silent
    }
  }, []);

  const syncPlay = useCallback(async () => {
    if (serverCommandInFlight.current) return;
    try {
      await apiUnpause();
    } catch {
      toast.error("SyncPlay: failed to play");
    }
  }, []);

  const syncPause = useCallback(async () => {
    if (serverCommandInFlight.current) return;
    try {
      await apiPause();
    } catch {
      toast.error("SyncPlay: failed to pause");
    }
  }, []);

  const syncSeek = useCallback(async (positionTicks: number) => {
    if (serverCommandInFlight.current) return;
    try {
      await apiSeek(positionTicks);
    } catch {
      toast.error("SyncPlay: failed to seek");
    }
  }, []);

  const syncStop = useCallback(async () => {
    if (serverCommandInFlight.current) return;
    try {
      await apiStop();
    } catch {
      toast.error("SyncPlay: failed to stop");
    }
  }, []);

  const syncNext = useCallback(async () => {
    if (serverCommandInFlight.current) return;
    try {
      await apiNextItem(manager?.playbackState?.currentItem?.Id || "");
    } catch {
      toast.error("SyncPlay: failed to skip");
    }
  }, [manager]);

  const syncPrevious = useCallback(async () => {
    if (serverCommandInFlight.current) return;
    try {
      await apiPreviousItem(manager?.playbackState?.currentItem?.Id || "");
    } catch {
      toast.error("SyncPlay: failed to go back");
    }
  }, [manager]);

  const setQueue = useCallback(
    async (itemIds: string[], startIndex: number = 0) => {
      try {
        if (itemIds.length > 0) {
          playingItemIdRef.current = itemIds[startIndex] || itemIds[0];
        }
        await apiSetNewQueue(itemIds, startIndex, 0);
      } catch {
        toast.error("SyncPlay: failed to set queue");
      }
    },
    [],
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

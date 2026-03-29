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
import { TimeSync, PlaybackCore } from "@/src/lib/syncplay-engine";
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
  getServerTime,
} from "@/src/actions/syncplay";
import { toast } from "sonner";

const TICKS_PER_MS = 10000;

interface GroupInfoDto {
  GroupId?: string;
  GroupName?: string;
  State?: string;
  Participants?: string[];
  LastUpdatedAt?: string;
}

interface VisibleGroup extends GroupInfoDto {
  isPublic: boolean;
  isUnlocked: boolean;
  joinCode?: string;
}

interface SyncPlayContextType {
  isInGroup: boolean;
  currentGroup: GroupInfoDto | null;
  currentJoinCode: string | null;
  availableGroups: VisibleGroup[];
  error: string | null;

  createGroup: (groupName: string, isPublic: boolean) => Promise<string | null>;
  joinGroup: (groupId: string) => Promise<void>;
  joinWithCode: (code: string) => Promise<boolean>;
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

const SyncPlayContext = createContext<SyncPlayContextType | undefined>(undefined);

export function SyncPlayProvider({ children }: { children: React.ReactNode }) {
  const manager = usePlaybackContext();
  const { serverUrl, user, isAuthenticated } = useAuth();
  const token = (user as any)?.AccessToken;
  const userId = (user as any)?.Id || "";

  const [isInGroup, setIsInGroup] = useState(false);
  const [currentGroup, setCurrentGroup] = useState<GroupInfoDto | null>(null);
  const [currentJoinCode, setCurrentJoinCode] = useState<string | null>(null);
  const [availableGroups, setAvailableGroups] = useState<VisibleGroup[]>([]);
  const [error, setError] = useState<string | null>(null);

  const playingItemIdRef = useRef<string | null>(null);
  const groupJoinedAt = useRef<number>(0);
  const enabledAt = useRef<number>(0);
  const isInGroupRef = useRef(false);

  // Keep ref in sync with state
  useEffect(() => {
    isInGroupRef.current = isInGroup;
  }, [isInGroup]);
  const timeSyncReady = useRef(false);
  const queuedCommand = useRef<any>(null);

  // Pending group creation for metadata registration
  const pendingGroupCreation = useRef<{
    groupName: string;
    isPublic: boolean;
    resolve: (code: string | null) => void;
  } | null>(null);

  // --- Time Sync + PlaybackCore ---

  const timeSyncRef = useRef<TimeSync | null>(null);
  const playbackCoreRef = useRef<PlaybackCore | null>(null);

  // Create TimeSync instance
  useEffect(() => {
    const ts = new TimeSync(getServerTime);
    timeSyncRef.current = ts;

    ts.onUpdate = (offset, ping) => {
      // Report ping to server
      if (isInGroupRef.current) {
        apiPing(Math.round(ping)).catch(() => {});
      }

      // Mark time sync as ready — process queued command
      if (!timeSyncReady.current) {
        timeSyncReady.current = true;
        if (queuedCommand.current) {
          playbackCoreRef.current?.applyCommand(queuedCommand.current);
          queuedCommand.current = null;
        }
      }
    };

    return () => {
      ts.stop();
    };
  }, []);

  // Keep a stable ref to the manager so PlaybackCore doesn't recreate on every render
  const managerRef = useRef(manager);
  useEffect(() => {
    managerRef.current = manager;
  }, [manager]);

  // Create PlaybackCore once (uses managerRef to always access current manager)
  useEffect(() => {
    if (!timeSyncRef.current) return;

    const playerActions = {
      pause: () => managerRef.current?.pause(),
      unpause: () => managerRef.current?.unpause(),
      seek: (ticks: number) => managerRef.current?.seek(ticks),
      stop: () => managerRef.current?.stop(),
      setPlaybackRate: (rate: number) => managerRef.current?.setPlaybackRate(rate),
      getCurrentTimeTicks: () =>
        Math.round((managerRef.current?.playbackState?.currentTime || 0) * 1000 * TICKS_PER_MS),
      isPlaying: () =>
        !managerRef.current?.playbackState?.paused && !!managerRef.current?.playbackState?.currentItem,
    };

    const core = new PlaybackCore(timeSyncRef.current, playerActions);
    playbackCoreRef.current = core;

    return () => {
      core.destroy();
    };
  }, []); // Only create once

  // Feed position to sync correction engine via interval (not useEffect on currentTime
  // which causes infinite re-render loops when the engine adjusts playback rate/position)
  useEffect(() => {
    if (!isInGroup || !manager) return;

    const syncInterval = setInterval(() => {
      const { currentTime, paused } = manager.playbackState;
      if (paused) return;
      playbackCoreRef.current?.onTimeUpdate(
        Date.now(),
        currentTime * 1000,
      );
    }, 2000); // Check every 2 seconds

    return () => clearInterval(syncInterval);
  }, [isInGroup, manager]);

  // --- WebSocket ---

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

  // --- Buffering reporting ---

  useEffect(() => {
    if (!isInGroup || !manager) return;

    const { isBuffering, currentTime, paused, currentItem } = manager.playbackState;
    const ts = timeSyncRef.current;
    if (!ts) return;

    const nowRemote = new Date(ts.localToRemote(Date.now())).toISOString();
    const options = {
      When: nowRemote,
      PositionTicks: Math.round(currentTime * 1000 * TICKS_PER_MS),
      IsPlaying: !paused,
      PlaylistItemId: currentItem?.Id || "",
    };

    if (isBuffering) {
      apiBuffering(options).catch(() => {});
    } else {
      apiReady(options).catch(() => {});
    }
  }, [isInGroup, manager?.playbackState?.isBuffering]);

  // --- Command handlers ---

  const handleSyncPlayCommand = useCallback(
    (data: any) => {
      if (!isInGroupRef.current) return;

      // Reject commands emitted before SyncPlay was enabled
      if (data.EmittedAt) {
        const emittedAt = new Date(data.EmittedAt).getTime();
        if (emittedAt < enabledAt.current) return;
      }

      // Queue if time sync not ready yet
      if (!timeSyncReady.current) {
        queuedCommand.current = data;
        return;
      }

      playbackCoreRef.current?.applyCommand(data);
    },
    [],
  );

  const handleGroupUpdate = useCallback(
    async (data: any) => {
      const { Type, Data } = data;

      switch (Type) {
        case "GroupJoined": {
          groupJoinedAt.current = Date.now();
          enabledAt.current = Data?.LastUpdatedAt
            ? new Date(Data.LastUpdatedAt).getTime()
            : Date.now();
          timeSyncReady.current = false;
          queuedCommand.current = null;
          setIsInGroup(true);
          setCurrentGroup(Data);
          setError(null);

          // Start time sync
          timeSyncRef.current?.forceUpdate();

          // Register group metadata if this was a creation
          const pending = pendingGroupCreation.current;
          if (pending && Data?.GroupId) {
            pendingGroupCreation.current = null;
            fetch("/api/syncplay/groups", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                groupId: Data.GroupId,
                groupName: pending.groupName,
                isPublic: pending.isPublic,
                creatorUserId: userId,
              }),
            })
              .then((res) => res.json())
              .then((d) => {
                const code = d.joinCode || null;
                setCurrentJoinCode(code);
                pending.resolve(code);
              })
              .catch(() => pending.resolve(null));
          } else {
            toast.success(`Joined: ${Data?.GroupName || "Watch Party"}`);
          }
          break;
        }

        case "GroupLeft":
          setIsInGroup(false);
          setCurrentGroup(null);
          setCurrentJoinCode(null);
          playingItemIdRef.current = null;
          timeSyncReady.current = false;
          playbackCoreRef.current?.destroy();
          toast.info("Left watch party");
          break;

        case "UserJoined":
          setCurrentGroup((prev) => {
            if (!prev) return prev;
            const participants = [...(prev.Participants || [])];
            if (!participants.includes(Data)) participants.push(Data);
            return { ...prev, Participants: participants };
          });
          break;

        case "UserLeft":
          setCurrentGroup((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              Participants: (prev.Participants || []).filter((p) => p !== Data),
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
                await manager.play(itemDetails as any, {
                  startPositionTicks: StartPositionTicks || 0,
                });
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
          setCurrentJoinCode(null);
          setError("Group no longer exists");
          toast.error("Watch party ended");
          break;
      }
    },
    [manager, userId],
  );

  // --- WebSocket subscriptions ---

  const handleCommandRef = useRef(handleSyncPlayCommand);
  const handleUpdateRef = useRef(handleGroupUpdate);
  useEffect(() => {
    handleCommandRef.current = handleSyncPlayCommand;
    handleUpdateRef.current = handleGroupUpdate;
  }, [handleSyncPlayCommand, handleGroupUpdate]);

  useEffect(() => {
    const unsubCommand = jellyfinWs.subscribe("SyncPlayCommand", (data: any) =>
      handleCommandRef.current(data),
    );
    const unsubGroupUpdate = jellyfinWs.subscribe("SyncPlayGroupUpdate", (data: any) =>
      handleUpdateRef.current(data),
    );
    return () => {
      unsubCommand();
      unsubGroupUpdate();
    };
  }, []);

  // --- Group polling ---

  const fetchVisibleGroups = useCallback(async () => {
    try {
      const jellyfinGroups: GroupInfoDto[] = (await apiGetGroups()) || [];
      if (jellyfinGroups.length === 0) {
        setAvailableGroups([]);
        return;
      }

      const metaResponse = await fetch(
        `/api/syncplay/groups?userId=${encodeURIComponent(userId)}`,
      );
      const metaData = await metaResponse.json();
      const metaGroups: Record<string, any> = {};
      for (const g of metaData.groups || []) {
        metaGroups[g.groupId] = g;
      }

      const visible: VisibleGroup[] = [];
      for (const jg of jellyfinGroups) {
        const meta = metaGroups[jg.GroupId || ""];
        if (meta) {
          if (meta.isPublic || meta.isUnlocked) {
            visible.push({
              ...jg,
              isPublic: meta.isPublic,
              isUnlocked: meta.isUnlocked,
              joinCode: meta.isUnlocked ? meta.joinCode : undefined,
            });
          }
        } else {
          visible.push({ ...jg, isPublic: true, isUnlocked: true });
        }
      }

      setAvailableGroups(visible);
    } catch {
      // Silent
    }
  }, [userId]);

  useEffect(() => {
    if (isInGroup || !isAuthenticated) return;
    fetchVisibleGroups();
    const interval = setInterval(fetchVisibleGroups, 15000);
    return () => clearInterval(interval);
  }, [isInGroup, isAuthenticated, fetchVisibleGroups]);

  // --- Public actions ---

  const createGroup = useCallback(
    async (groupName: string, isPublic: boolean): Promise<string | null> => {
      try {
        const codePromise = new Promise<string | null>((resolve) => {
          pendingGroupCreation.current = { groupName, isPublic, resolve };
          setTimeout(() => {
            if (pendingGroupCreation.current?.resolve === resolve) {
              pendingGroupCreation.current = null;
              resolve(null);
            }
          }, 10000);
        });

        await apiCreateGroup(groupName);
        return await codePromise;
      } catch (err) {
        console.error("[SyncPlay] Failed to create group:", err);
        pendingGroupCreation.current = null;
        toast.error("Failed to create group");
        return null;
      }
    },
    [userId],
  );

  const joinGroup = useCallback(async (groupId: string) => {
    try {
      await apiJoinGroup(groupId);
    } catch {
      toast.error("Failed to join group");
    }
  }, []);

  const joinWithCode = useCallback(async (code: string): Promise<boolean> => {
    try {
      const res = await fetch("/api/syncplay/groups", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ joinCode: code }),
      });
      if (!res.ok) {
        toast.error("Invalid join code");
        return false;
      }
      const { groupId } = await res.json();
      await apiJoinGroup(groupId);
      return true;
    } catch {
      toast.error("Failed to join group");
      return false;
    }
  }, []);

  const leaveGroup = useCallback(async () => {
    try {
      await apiLeaveGroup();
      setIsInGroup(false);
      setCurrentGroup(null);
      setCurrentJoinCode(null);
      playingItemIdRef.current = null;
    } catch {
      toast.error("Failed to leave group");
    }
  }, []);

  const refreshGroups = useCallback(async () => {
    await fetchVisibleGroups();
  }, [fetchVisibleGroups]);

  // SyncPlay actions — these go to the SERVER, not the local player
  const syncPlay = useCallback(async () => {
    try { await apiUnpause(); } catch { toast.error("SyncPlay: failed to play"); }
  }, []);

  const syncPause = useCallback(async () => {
    try { await apiPause(); } catch { toast.error("SyncPlay: failed to pause"); }
  }, []);

  const syncSeek = useCallback(async (positionTicks: number) => {
    try { await apiSeek(positionTicks); } catch { toast.error("SyncPlay: failed to seek"); }
  }, []);

  const syncStop = useCallback(async () => {
    try { await apiStop(); } catch { toast.error("SyncPlay: failed to stop"); }
  }, []);

  const syncNext = useCallback(async () => {
    try {
      await apiNextItem(manager?.playbackState?.currentItem?.Id || "");
    } catch { toast.error("SyncPlay: failed to skip"); }
  }, [manager]);

  const syncPrevious = useCallback(async () => {
    try {
      await apiPreviousItem(manager?.playbackState?.currentItem?.Id || "");
    } catch { toast.error("SyncPlay: failed to go back"); }
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
      isInGroup, currentGroup, currentJoinCode, availableGroups, error,
      createGroup, joinGroup, joinWithCode, leaveGroup, refreshGroups,
      syncPlay, syncPause, syncSeek, syncStop, syncNext, syncPrevious, setQueue,
    }),
    [
      isInGroup, currentGroup, currentJoinCode, availableGroups, error,
      createGroup, joinGroup, joinWithCode, leaveGroup, refreshGroups,
      syncPlay, syncPause, syncSeek, syncStop, syncNext, syncPrevious, setQueue,
    ],
  );

  return (
    <SyncPlayContext.Provider value={value}>{children}</SyncPlayContext.Provider>
  );
}

const noopAsync = async () => {};

const defaultSyncPlayContext: SyncPlayContextType = {
  isInGroup: false, currentGroup: null, currentJoinCode: null,
  availableGroups: [], error: null,
  createGroup: async () => null, joinGroup: noopAsync,
  joinWithCode: async () => false, leaveGroup: noopAsync,
  refreshGroups: noopAsync, syncPlay: noopAsync, syncPause: noopAsync,
  syncSeek: noopAsync, syncStop: noopAsync, syncNext: noopAsync,
  syncPrevious: noopAsync, setQueue: noopAsync,
};

export function useSyncPlay() {
  const context = useContext(SyncPlayContext);
  return context === undefined ? defaultSyncPlayContext : context;
}

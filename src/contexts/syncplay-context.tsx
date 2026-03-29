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

const SyncPlayContext = createContext<SyncPlayContextType | undefined>(
  undefined,
);

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

  const serverCommandInFlight = useRef(false);
  const playingItemIdRef = useRef<string | null>(null);
  const serverTimeOffset = useRef(0);
  const groupJoinedAt = useRef<number>(0);

  // Pending group creation — registered in GroupJoined handler where we have the actual GroupId
  const pendingGroupCreation = useRef<{
    groupName: string;
    isPublic: boolean;
    resolve: (code: string | null) => void;
  } | null>(null);

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
              if (Date.now() - groupJoinedAt.current < 5000) {
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
        case "GroupJoined": {
          groupJoinedAt.current = Date.now();
          setIsInGroup(true);
          setCurrentGroup(Data);
          setError(null);

          // If we have a pending group creation, register metadata now that we have the GroupId
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
              .then((data) => {
                const code = data.joinCode || null;
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
          // Clean up group metadata
          if (Data?.GroupId || currentGroup?.GroupId) {
            fetch("/api/syncplay/groups", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ groupId: Data?.GroupId || currentGroup?.GroupId }),
            }).catch(() => {});
          }
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
          setCurrentJoinCode(null);
          setError("Group no longer exists");
          toast.error("Watch party ended");
          break;
      }
    },
    [manager, currentGroup],
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

  // --- Polling for visible groups ---

  const fetchVisibleGroups = useCallback(async () => {
    try {
      // Get all Jellyfin SyncPlay groups
      const jellyfinGroups: GroupInfoDto[] = (await apiGetGroups()) || [];

      if (jellyfinGroups.length === 0) {
        setAvailableGroups([]);
        return;
      }

      // Get our metadata for visibility filtering
      const metaResponse = await fetch(
        `/api/syncplay/groups?userId=${encodeURIComponent(userId)}`,
      );
      const metaData = await metaResponse.json();
      const metaGroups: Record<string, any> = {};
      for (const g of metaData.groups || []) {
        metaGroups[g.groupId] = g;
      }

      // Merge: only show groups that are public, unlocked, or have no metadata
      // (no metadata = created from OSD "New group" or external client = treat as public)
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
          // Private + not unlocked = invisible
        } else {
          // No metadata — legacy or external group, show as public
          visible.push({ ...jg, isPublic: true, isUnlocked: true });
        }
      }

      setAvailableGroups(visible);
    } catch {
      // Silent fail
    }
  }, [userId]);

  useEffect(() => {
    if (isInGroup || !isAuthenticated) return;

    fetchVisibleGroups();
    const interval = setInterval(fetchVisibleGroups, 15000);
    return () => clearInterval(interval);
  }, [isInGroup, isAuthenticated, fetchVisibleGroups]);

  // --- Ping ---

  useEffect(() => {
    if (!isInGroup) return;

    const pingInterval = setInterval(async () => {
      try {
        await apiPing(Math.round(serverTimeOffset.current));
      } catch {
        // Silent
      }
    }, 10000);

    return () => clearInterval(pingInterval);
  }, [isInGroup]);

  // --- Buffering ---

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

  // --- Public actions ---

  const createGroup = useCallback(
    async (groupName: string, isPublic: boolean): Promise<string | null> => {
      try {
        // Set up the pending creation — the GroupJoined WebSocket handler
        // will register metadata once we have the actual GroupId
        const codePromise = new Promise<string | null>((resolve) => {
          pendingGroupCreation.current = { groupName, isPublic, resolve };

          // Timeout fallback in case GroupJoined never arrives
          setTimeout(() => {
            if (pendingGroupCreation.current?.resolve === resolve) {
              pendingGroupCreation.current = null;
              resolve(null);
            }
          }, 10000);
        });

        // Create the SyncPlay group on Jellyfin
        await apiCreateGroup(groupName);

        // Wait for the GroupJoined handler to register metadata and return the code
        const joinCode = await codePromise;
        setError(null);
        return joinCode;
      } catch (err) {
        console.error("[SyncPlay] Failed to create group:", err);
        pendingGroupCreation.current = null;
        setError("Failed to create group");
        toast.error("Failed to create group");
        return null;
      }
    },
    [userId],
  );

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

  const joinWithCode = useCallback(
    async (code: string): Promise<boolean> => {
      try {
        // Validate code with our metadata API
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

        // Join the actual Jellyfin SyncPlay group
        await apiJoinGroup(groupId);
        setError(null);
        return true;
      } catch (err) {
        console.error("[SyncPlay] Failed to join with code:", err);
        toast.error("Failed to join group");
        return false;
      }
    },
    [],
  );

  const leaveGroup = useCallback(async () => {
    try {
      await apiLeaveGroup();
      setIsInGroup(false);
      setCurrentGroup(null);
      setCurrentJoinCode(null);
      playingItemIdRef.current = null;
      setError(null);
    } catch (err) {
      console.error("[SyncPlay] Failed to leave group:", err);
      setError("Failed to leave group");
      toast.error("Failed to leave group");
    }
  }, []);

  const refreshGroups = useCallback(async () => {
    await fetchVisibleGroups();
  }, [fetchVisibleGroups]);

  const syncPlay = useCallback(async () => {
    if (serverCommandInFlight.current) return;
    try { await apiUnpause(); } catch { toast.error("SyncPlay: failed to play"); }
  }, []);

  const syncPause = useCallback(async () => {
    if (serverCommandInFlight.current) return;
    try { await apiPause(); } catch { toast.error("SyncPlay: failed to pause"); }
  }, []);

  const syncSeek = useCallback(async (positionTicks: number) => {
    if (serverCommandInFlight.current) return;
    try { await apiSeek(positionTicks); } catch { toast.error("SyncPlay: failed to seek"); }
  }, []);

  const syncStop = useCallback(async () => {
    if (serverCommandInFlight.current) return;
    try { await apiStop(); } catch { toast.error("SyncPlay: failed to stop"); }
  }, []);

  const syncNext = useCallback(async () => {
    if (serverCommandInFlight.current) return;
    try { await apiNextItem(manager?.playbackState?.currentItem?.Id || ""); } catch { toast.error("SyncPlay: failed to skip"); }
  }, [manager]);

  const syncPrevious = useCallback(async () => {
    if (serverCommandInFlight.current) return;
    try { await apiPreviousItem(manager?.playbackState?.currentItem?.Id || ""); } catch { toast.error("SyncPlay: failed to go back"); }
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
      currentJoinCode,
      availableGroups,
      error,
      createGroup,
      joinGroup,
      joinWithCode,
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
      isInGroup, currentGroup, currentJoinCode, availableGroups, error,
      createGroup, joinGroup, joinWithCode, leaveGroup, refreshGroups,
      syncPlay, syncPause, syncSeek, syncStop, syncNext, syncPrevious, setQueue,
    ],
  );

  return (
    <SyncPlayContext.Provider value={value}>
      {children}
    </SyncPlayContext.Provider>
  );
}

const noopAsync = async () => {};
const noopAsyncNull = async () => null;
const noopAsyncBool = async () => false;

const defaultSyncPlayContext: SyncPlayContextType = {
  isInGroup: false,
  currentGroup: null,
  currentJoinCode: null,
  availableGroups: [],
  error: null,
  createGroup: noopAsyncNull as any,
  joinGroup: noopAsync,
  joinWithCode: noopAsyncBool,
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

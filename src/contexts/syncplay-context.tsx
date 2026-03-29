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
import { createJellyfinInstance } from "@/src/lib/utils";
import { getSyncPlayApi } from "@jellyfin/sdk/lib/utils/api/sync-play-api";
import { getAuthData } from "@/src/actions/store/server-actions";
import { fetchMediaDetails } from "@/src/actions";
import type { GroupInfoDto } from "@jellyfin/sdk/lib/generated-client/models";
import { toast } from "sonner";

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

async function createSyncPlayApi() {
  const authData = await getAuthData();
  if (!authData) return null;

  const jellyfin = createJellyfinInstance();
  const api = jellyfin.createApi(authData.serverUrl);
  api.accessToken = (authData.user as any)?.AccessToken;
  return getSyncPlayApi(api);
}

export function SyncPlayProvider({ children }: { children: React.ReactNode }) {
  const manager = usePlaybackContext();
  const { serverUrl, isAuthenticated } = useAuth();

  const [isInGroup, setIsInGroup] = useState(false);
  const [currentGroup, setCurrentGroup] = useState<GroupInfoDto | null>(null);
  const [availableGroups, setAvailableGroups] = useState<GroupInfoDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Ref to prevent feedback loops: when true, actions originated from server
  const serverCommandInFlight = useRef(false);

  // Tracks item ID we're already playing/loading to prevent PlayQueue re-trigger
  const playingItemIdRef = useRef<string | null>(null);

  // Ping tracking for time offset
  const pingTimestamps = useRef<number[]>([]);
  const serverTimeOffset = useRef(0);

  // Connect WebSocket when authenticated
  useEffect(() => {
    if (!isAuthenticated || !serverUrl) return;

    async function connectWs() {
      const authData = await getAuthData();
      if (!authData) return;

      const token = (authData.user as any)?.AccessToken;
      const deviceId = getDeviceId();
      if (token && deviceId) {
        jellyfinWs.connect(authData.serverUrl, token, deviceId);
      }
    }

    connectWs();

    return () => {
      jellyfinWs.disconnect();
    };
  }, [isAuthenticated, serverUrl]);

  // Subscribe to SyncPlay WebSocket messages
  useEffect(() => {
    const unsubCommand = jellyfinWs.subscribe(
      "SyncPlayCommand",
      (data: any) => {
        handleSyncPlayCommand(data);
      },
    );

    const unsubGroupUpdate = jellyfinWs.subscribe(
      "SyncPlayGroupUpdate",
      (data: any) => {
        handleGroupUpdate(data);
      },
    );

    return () => {
      unsubCommand();
      unsubGroupUpdate();
    };
  }, []);

  // Poll for available groups when not in a group
  useEffect(() => {
    if (isInGroup) return;

    const pollGroups = async () => {
      try {
        const api = await createSyncPlayApi();
        if (!api) return;
        const response = await api.syncPlayGetGroups();
        setAvailableGroups(response.data || []);
      } catch {
        // Silent fail on poll
      }
    };

    pollGroups();
    const interval = setInterval(pollGroups, 15000);
    return () => clearInterval(interval);
  }, [isInGroup]);

  // Ping interval when in group
  useEffect(() => {
    if (!isInGroup) return;

    const pingInterval = setInterval(async () => {
      try {
        const api = await createSyncPlayApi();
        if (!api) return;

        const sendTime = Date.now();
        await api.syncPlayPing({
          pingRequestDto: { Ping: Math.round(serverTimeOffset.current) },
        });
        const roundTrip = Date.now() - sendTime;

        pingTimestamps.current.push(roundTrip);
        if (pingTimestamps.current.length > 5) {
          pingTimestamps.current.shift();
        }
      } catch {
        // Silent fail on ping
      }
    }, 10000);

    return () => clearInterval(pingInterval);
  }, [isInGroup]);

  // Report buffering state to SyncPlay when in group
  useEffect(() => {
    if (!isInGroup || !manager) return;

    const { isBuffering, currentTime, paused, currentItem } =
      manager.playbackState;

    const reportBufferingState = async () => {
      try {
        const api = await createSyncPlayApi();
        if (!api) return;

        const requestBody = {
          When: new Date().toISOString(),
          PositionTicks: Math.round(currentTime * 10000000),
          IsPlaying: !paused,
          PlaylistItemId: currentItem?.Id || "",
        };

        if (isBuffering) {
          await api.syncPlayBuffering({ bufferRequestDto: requestBody });
        } else {
          await api.syncPlayReady({ readyRequestDto: requestBody });
        }
      } catch {
        // Silent fail
      }
    };

    reportBufferingState();
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

      // Timed execution for Unpause and Seek
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
          toast.success(`Joined group: ${Data?.GroupName || "Watch Party"}`);
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
          const { Playlist, PlayingItemIndex, StartPositionTicks } =
            Data;
          if (
            Playlist &&
            Playlist.length > 0 &&
            PlayingItemIndex != null
          ) {
            const currentItemId = Playlist[PlayingItemIndex]?.ItemId;
            // Skip if we're already playing/loading this item
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

  // --- Public actions ---

  const createGroup = useCallback(async (groupName: string) => {
    try {
      const api = await createSyncPlayApi();
      if (!api) return;
      await api.syncPlayCreateGroup({
        newGroupRequestDto: { GroupName: groupName },
      });
      setError(null);
    } catch (err) {
      const message = "Failed to create group";
      setError(message);
      toast.error(message);
    }
  }, []);

  const joinGroup = useCallback(async (groupId: string) => {
    try {
      const api = await createSyncPlayApi();
      if (!api) return;
      await api.syncPlayJoinGroup({
        joinGroupRequestDto: { GroupId: groupId },
      });
      setError(null);
    } catch (err) {
      const message = "Failed to join group";
      setError(message);
      toast.error(message);
    }
  }, []);

  const leaveGroup = useCallback(async () => {
    try {
      const api = await createSyncPlayApi();
      if (!api) return;
      await api.syncPlayLeaveGroup();
      setIsInGroup(false);
      setCurrentGroup(null);
      playingItemIdRef.current = null;
      setError(null);
    } catch (err) {
      const message = "Failed to leave group";
      setError(message);
      toast.error(message);
    }
  }, []);

  const refreshGroups = useCallback(async () => {
    try {
      const api = await createSyncPlayApi();
      if (!api) return;
      const response = await api.syncPlayGetGroups();
      setAvailableGroups(response.data || []);
    } catch {
      // Silent
    }
  }, []);

  const syncPlay = useCallback(async () => {
    if (serverCommandInFlight.current) return;
    try {
      const api = await createSyncPlayApi();
      if (!api) return;
      await api.syncPlayUnpause();
    } catch {
      toast.error("SyncPlay: failed to play");
    }
  }, []);

  const syncPause = useCallback(async () => {
    if (serverCommandInFlight.current) return;
    try {
      const api = await createSyncPlayApi();
      if (!api) return;
      await api.syncPlayPause();
    } catch {
      toast.error("SyncPlay: failed to pause");
    }
  }, []);

  const syncSeek = useCallback(async (positionTicks: number) => {
    if (serverCommandInFlight.current) return;
    try {
      const api = await createSyncPlayApi();
      if (!api) return;
      await api.syncPlaySeek({
        seekRequestDto: { PositionTicks: positionTicks },
      });
    } catch {
      toast.error("SyncPlay: failed to seek");
    }
  }, []);

  const syncStop = useCallback(async () => {
    if (serverCommandInFlight.current) return;
    try {
      const api = await createSyncPlayApi();
      if (!api) return;
      await api.syncPlayStop();
    } catch {
      toast.error("SyncPlay: failed to stop");
    }
  }, []);

  const syncNext = useCallback(async () => {
    if (serverCommandInFlight.current) return;
    try {
      const api = await createSyncPlayApi();
      if (!api) return;
      await api.syncPlayNextItem({
        nextItemRequestDto: {
          PlaylistItemId: manager?.playbackState?.currentItem?.Id || "",
        },
      });
    } catch {
      toast.error("SyncPlay: failed to skip to next");
    }
  }, [manager]);

  const syncPrevious = useCallback(async () => {
    if (serverCommandInFlight.current) return;
    try {
      const api = await createSyncPlayApi();
      if (!api) return;
      await api.syncPlayPreviousItem({
        previousItemRequestDto: {
          PlaylistItemId: manager?.playbackState?.currentItem?.Id || "",
        },
      });
    } catch {
      toast.error("SyncPlay: failed to go to previous");
    }
  }, [manager]);

  const setQueue = useCallback(
    async (itemIds: string[], startIndex: number = 0) => {
      try {
        // Mark the item we're about to play so PlayQueue handler skips it
        if (itemIds.length > 0) {
          playingItemIdRef.current = itemIds[startIndex] || itemIds[0];
        }
        const api = await createSyncPlayApi();
        if (!api) return;
        await api.syncPlaySetNewQueue({
          playRequestDto: {
            PlayingQueue: itemIds,
            PlayingItemPosition: startIndex,
            StartPositionTicks: 0,
          },
        });
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
  // Return safe default during SSR/prerendering when provider isn't mounted
  if (context === undefined) {
    return defaultSyncPlayContext;
  }
  return context;
}

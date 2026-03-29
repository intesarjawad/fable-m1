import { useCallback } from "react";
import { usePlaybackContext } from "../context/PlaybackContext";
import { useSyncPlay } from "@/src/contexts/syncplay-context";

/**
 * Routes playback actions correctly for SyncPlay.
 *
 * When in a group:
 * - User actions go to the SyncPlay server (not the local player)
 * - Exception: pause also pauses locally immediately for responsiveness
 *   (the server will confirm with exact position)
 * - The server distributes commands to all clients via WebSocket
 * - The SyncPlayProvider executes server commands on the local player
 *
 * When not in a group:
 * - Actions go directly to the PlaybackManager as usual
 */
export function useSyncPlayGuard() {
  const manager = usePlaybackContext();
  const syncPlay = useSyncPlay();

  const guardedPlay = useCallback(() => {
    if (syncPlay.isInGroup) {
      // Send to server — server will send Unpause command to all clients
      syncPlay.syncPlay().catch(() => {});
    } else {
      manager.unpause();
    }
  }, [manager, syncPlay]);

  const guardedPause = useCallback(() => {
    if (syncPlay.isInGroup) {
      // Pause locally immediately for responsiveness (official client does this)
      manager.pause();
      // Tell the server — it will confirm with exact position for all clients
      syncPlay.syncPause().catch(() => {});
    } else {
      manager.pause();
    }
  }, [manager, syncPlay]);

  const guardedSeek = useCallback(
    (ticks: number) => {
      if (syncPlay.isInGroup) {
        // Send to server — server will send Seek command to all clients
        syncPlay.syncSeek(ticks).catch(() => {});
      } else {
        manager.seek(ticks);
      }
    },
    [manager, syncPlay],
  );

  const guardedStop = useCallback(() => {
    if (syncPlay.isInGroup) {
      syncPlay.syncStop().catch(() => {});
    } else {
      manager.stop();
    }
  }, [manager, syncPlay]);

  const guardedNext = useCallback(() => {
    if (syncPlay.isInGroup) {
      syncPlay.syncNext().catch(() => {});
    } else {
      manager.next();
    }
  }, [manager, syncPlay]);

  const guardedPrevious = useCallback(() => {
    if (syncPlay.isInGroup) {
      syncPlay.syncPrevious().catch(() => {});
    } else {
      manager.previous();
    }
  }, [manager, syncPlay]);

  return {
    play: guardedPlay,
    pause: guardedPause,
    seek: guardedSeek,
    stop: guardedStop,
    next: guardedNext,
    previous: guardedPrevious,
    isInGroup: syncPlay.isInGroup,
    canChangeRate: !syncPlay.isInGroup,
  };
}

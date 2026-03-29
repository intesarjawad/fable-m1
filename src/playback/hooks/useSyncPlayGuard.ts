import { useCallback } from "react";
import { usePlaybackContext } from "../context/PlaybackContext";
import { useSyncPlay } from "@/src/contexts/syncplay-context";

export function useSyncPlayGuard() {
  const manager = usePlaybackContext();
  const syncPlay = useSyncPlay();

  // When in a group: execute locally for instant feedback,
  // then notify the SyncPlay server in the background.
  // The server will coordinate all clients via WebSocket.

  const guardedPlay = useCallback(() => {
    manager.unpause();
    if (syncPlay.isInGroup) {
      syncPlay.syncPlay().catch(() => {});
    }
  }, [manager, syncPlay]);

  const guardedPause = useCallback(() => {
    manager.pause();
    if (syncPlay.isInGroup) {
      syncPlay.syncPause().catch(() => {});
    }
  }, [manager, syncPlay]);

  const guardedSeek = useCallback(
    (ticks: number) => {
      manager.seek(ticks);
      if (syncPlay.isInGroup) {
        syncPlay.syncSeek(ticks).catch(() => {});
      }
    },
    [manager, syncPlay],
  );

  const guardedStop = useCallback(() => {
    manager.stop();
    if (syncPlay.isInGroup) {
      syncPlay.syncStop().catch(() => {});
    }
  }, [manager, syncPlay]);

  const guardedNext = useCallback(() => {
    manager.next();
    if (syncPlay.isInGroup) {
      syncPlay.syncNext().catch(() => {});
    }
  }, [manager, syncPlay]);

  const guardedPrevious = useCallback(() => {
    manager.previous();
    if (syncPlay.isInGroup) {
      syncPlay.syncPrevious().catch(() => {});
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

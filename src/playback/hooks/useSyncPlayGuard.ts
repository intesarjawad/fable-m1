// src/playback/hooks/useSyncPlayGuard.ts
import { usePlaybackContext } from "../context/PlaybackContext";
import { useSyncPlay } from "@/src/contexts/syncplay-context";

export function useSyncPlayGuard() {
  const manager = usePlaybackContext();
  const syncPlay = useSyncPlay();

  if (syncPlay.isInGroup) {
    return {
      play: syncPlay.syncPlay,
      pause: syncPlay.syncPause,
      seek: syncPlay.syncSeek,
      stop: syncPlay.syncStop,
      next: syncPlay.syncNext,
      previous: syncPlay.syncPrevious,
      isInGroup: true as const,
      canChangeRate: false,
    };
  }

  return {
    play: manager.unpause,
    pause: manager.pause,
    seek: manager.seek,
    stop: manager.stop,
    next: manager.next,
    previous: manager.previous,
    isInGroup: false as const,
    canChangeRate: true,
  };
}

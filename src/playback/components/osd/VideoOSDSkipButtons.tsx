"use client";
import React from "react";
import { PlaybackContextValue } from "@/src/playback/hooks/usePlaybackManager";
import { MediaSegment } from "@/src/actions/media";

interface VideoOSDSkipButtonsProps {
  manager: PlaybackContextValue;
  activeSegment: MediaSegment | undefined;
  hasNextEpisode: boolean;
  nextEpisodeData: any;
  handleMouseMove: () => void;
  episodePlayOptions?: any;
  onSeek?: (ticks: number) => void;
  onPause?: () => void;
}

export const VideoOSDSkipButtons: React.FC<VideoOSDSkipButtonsProps> = ({
  manager,
  activeSegment,
  hasNextEpisode,
  nextEpisodeData,
  handleMouseMove,
  episodePlayOptions,
  onSeek,
  onPause,
}) => {
  if (!activeSegment) return null;

  const isCredits = activeSegment.Type === "Outro";
  const buttonText =
    isCredits && hasNextEpisode ? "Next Episode" : `Skip ${activeSegment.Type}`;

  return (
    <div
      className="absolute right-10 z-50 pointer-events-auto flex items-center gap-4"
      style={{ bottom: "20%" }}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleMouseMove();
          if (isCredits && hasNextEpisode && nextEpisodeData) {
            manager.play(
              nextEpisodeData,
              episodePlayOptions || { startPositionTicks: 0 },
            );
          } else {
            const endTicks = activeSegment.EndTicks;
            (onSeek || manager.seek)(endTicks);
            if (isCredits && !hasNextEpisode) {
              setTimeout(() => {
                (onPause || manager.pause)();
              }, 500);
            }
          }
        }}
        className="text-black text-sm font-semibold px-4.5 py-2.5 bg-white hover:bg-white/90 rounded-lg transition-all duration-200 shadow-xl"
      >
        {buttonText}
      </button>
    </div>
  );
};

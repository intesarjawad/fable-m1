import React from "react";
import { ArrowLeft } from "lucide-react";
import { PlaybackContextValue } from "@/src/playback/hooks/usePlaybackManager";
import { SettingsMenu } from "../SettingsMenu";
import { SyncPlayButton } from "./SyncPlayButton";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";

interface VideoOSDHeaderProps {
  manager: PlaybackContextValue;
  isVisible: boolean;
  currentItem: BaseItemDto | null;
  onBack: () => void;
  onControlsClick: (e: React.MouseEvent) => void;
}

export const VideoOSDHeader: React.FC<VideoOSDHeaderProps> = ({
  manager,
  isVisible,
  currentItem,
  onBack,
  onControlsClick,
}) => {
  return (
    <header
      className={`flex items-center justify-between transition-transform duration-300 ${isVisible ? "translate-y-0" : "-translate-y-full"}`}
      onClick={onControlsClick}
    >
      <div className="flex items-center gap-6">
        <button
          onClick={onBack}
          className="glass-button rounded-full w-12 h-12 flex items-center justify-center group hover:bg-opacity-50 border border-white/10 transition-all duration-300 backdrop-blur-sm"
          style={{
            background: "rgba(255, 255, 255, 0.05)",
          }}
        >
          <ArrowLeft className="w-6 h-6 text-white/80 group-hover:text-white transition-colors" />
        </button>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-white drop-shadow-md">
            {currentItem?.SeriesName || currentItem?.Name}
          </h1>
          <div className="flex items-center gap-2 text-white/70 text-sm font-medium">
            {currentItem?.ParentIndexNumber !== undefined &&
              currentItem?.IndexNumber !== undefined && (
                <span
                  className="bg-white/10 px-2.5 py-1 rounded text-xs uppercase tracking-wider border border-white/5 font-mono font-bold text-white"
                  style={{ background: "rgba(255, 255, 255, 0.1)" }}
                >
                  S{String(currentItem.ParentIndexNumber).padStart(2, "0")}E
                  {String(currentItem.IndexNumber).padStart(2, "0")}
                </span>
              )}
            {currentItem?.SeriesName && (
              <span className="text-white">{currentItem?.Name}</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <SyncPlayButton />
        <SettingsMenu manager={manager} isVisible={isVisible} />
      </div>
    </header>
  );
};

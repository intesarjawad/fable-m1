import React, { useState, useEffect } from "react";
import { PlaybackContextValue } from "../hooks/usePlaybackManager";
import { PlaybackSpeedMenu } from "./settings/PlaybackSpeedMenu";
import { VideoQualityMenu } from "./settings/VideoQualityMenu";
import { SubtitleTracksMenu } from "./settings/SubtitleTracksMenu";
import { AudioTracksMenu } from "./settings/AudioTracksMenu";
import { useSyncPlay } from "@/src/contexts/syncplay-context";
import { useSettings } from "@/src/contexts/settings-context";

interface SettingsMenuProps {
  manager: PlaybackContextValue;
  isVisible?: boolean;
}

export const SettingsMenu: React.FC<SettingsMenuProps> = ({
  manager,
  isVisible = true,
}) => {
  const { isInGroup } = useSyncPlay();
  const { showQualitySelector } = useSettings();

  const [openSpeed, setOpenSpeed] = useState(false);
  const [openQuality, setOpenQuality] = useState(false);
  const [openSubtitles, setOpenSubtitles] = useState(false);
  const [openAudio, setOpenAudio] = useState(false);

  useEffect(() => {
    if (!isVisible) {
      setOpenSpeed(false);
      setOpenQuality(false);
      setOpenSubtitles(false);
      setOpenAudio(false);
    }
  }, [isVisible]);

  const closeAllMenus = () => {
    setOpenSpeed(false);
    setOpenQuality(false);
    setOpenSubtitles(false);
    setOpenAudio(false);
  };

  return (
    <div className="flex gap-4">
      {!isInGroup && (
        <PlaybackSpeedMenu
          manager={manager}
          open={openSpeed}
          onOpenChange={(open) => {
            if (open) closeAllMenus();
            setOpenSpeed(open);
          }}
        />
      )}

      {showQualitySelector && (
        <VideoQualityMenu
          manager={manager}
          open={openQuality}
          onOpenChange={(open) => {
            if (open) closeAllMenus();
            setOpenQuality(open);
          }}
        />
      )}

      <SubtitleTracksMenu
        manager={manager}
        open={openSubtitles}
        onOpenChange={(open) => {
          if (open) closeAllMenus();
          setOpenSubtitles(open);
        }}
      />

      <AudioTracksMenu
        manager={manager}
        open={openAudio}
        onOpenChange={(open) => {
          if (open) closeAllMenus();
          setOpenAudio(open);
        }}
      />
    </div>
  );
};

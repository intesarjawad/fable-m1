"use client";
import React, { useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "../../../components/ui/dropdown-menu";
import { Captions, Type } from "lucide-react";
import { PlaybackContextValue } from "../../hooks/usePlaybackManager";
import { getSubtitleTracks } from "../../../actions";
import { SettingsMenuButton } from "./SettingsMenuButton";

interface SubtitleTracksMenuProps {
  manager: PlaybackContextValue;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SubtitleTracksMenu: React.FC<SubtitleTracksMenuProps> = ({
  manager,
  open,
  onOpenChange,
}) => {
  const { playbackState } = manager;
  const { currentItem, currentMediaSource } = playbackState;
  const [subtitleTracks, setSubtitleTracks] = useState<any[]>([]);

  const [subtitleSize, setSubtitleSize] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("fable-subtitle-size");
      return saved ? parseInt(saved, 10) : 100;
    }
    return 100;
  });

  useEffect(() => {
    async function fetchTracks() {
      if (currentItem?.Id && currentMediaSource?.Id) {
        try {
          const subs = await getSubtitleTracks(
            currentItem.Id,
            currentMediaSource.Id,
          );
          setSubtitleTracks(subs);
        } catch (error) {
          console.error("Failed to fetch subtitle tracks", error);
        }
      }
    }
    fetchTracks();
  }, [currentItem?.Id, currentMediaSource?.Id]);

  const handleSubtitleSizeChange = (newSize: number) => {
    setSubtitleSize(newSize);
    localStorage.setItem("fable-subtitle-size", String(newSize));
    manager.reportState({ subtitleSize: newSize });

    window.dispatchEvent(
      new CustomEvent("subtitle-size-change", { detail: { size: newSize } }),
    );
  };

  const handleSubtitleChange = (indexStr: string) => {
    const index = parseInt(indexStr);
    if (isNaN(index)) {
      return;
    }

    if (index === 9999) {
      manager.reportState({ subtitleStreamIndex: 9999 });
      return;
    }

    manager.setSubtitleStreamIndex(index);
  };

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <SettingsMenuButton icon={Captions} isOpen={open} title="Subtitles" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        sideOffset={8}
        side="top"
        className="w-48 rounded-2xl overflow-hidden text-sm z-100 max-h-[60vh] overflow-y-auto"
        style={{
          background: "rgba(30, 30, 30, 0.65)",
          backdropFilter: "blur(40px)",
          WebkitBackdropFilter: "blur(40px)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
        }}
      >
        <DropdownMenuRadioGroup
          value={String(playbackState.subtitleStreamIndex ?? -1)}
          onValueChange={handleSubtitleChange}
        >
          <DropdownMenuRadioItem
            value="-1"
            className="px-5 py-2.5 transition-colors hover:bg-white/10 text-white"
          >
            <span className="text-white/90 ml-3">Off</span>
          </DropdownMenuRadioItem>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "12px",
              padding: "12px 20px 8px 20px",
            }}
          >
            <Type
              size={18}
              style={{ color: "rgba(255, 255, 255, 0.7)", flexShrink: 0 }}
            />

            <input
              type="range"
              min="10"
              max="400"
              value={subtitleSize}
              onChange={(e) =>
                handleSubtitleSizeChange(parseInt(e.target.value, 10))
              }
              style={
                {
                  flex: 1,
                  height: "6px",
                  borderRadius: "3px",
                  background: `linear-gradient(to right, white 0%, white ${((subtitleSize - 10) / 390) * 100}%, rgba(255, 255, 255, 0.2) ${((subtitleSize - 10) / 390) * 100}%, rgba(255, 255, 255, 0.2) 100%)`,
                  outline: "none",
                  WebkitAppearance: "none",
                  appearance: "none",
                  cursor: "pointer",
                } as React.CSSProperties & {
                  WebkitAppearance?: string;
                }
              }
            />
          </div>

          <DropdownMenuSeparator className="bg-white/10" />

          {subtitleTracks.map((track, i) => (
            <DropdownMenuRadioItem
              key={i}
              value={String(track.index)}
              className="px-5 py-2.5 transition-colors hover:bg-white/10 text-white"
            >
              <span className="text-white/90 ml-3">{track.label}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

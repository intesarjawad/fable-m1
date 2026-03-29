"use client";

import React, { useState } from "react";
import { Users, Plus, LogOut, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { useSyncPlay } from "@/src/contexts/syncplay-context";
import { SettingsMenuButton } from "../settings/SettingsMenuButton";

interface SyncPlayButtonProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SyncPlayButton({ open, onOpenChange }: SyncPlayButtonProps) {
  const {
    isInGroup,
    currentGroup,
    availableGroups,
    createGroup,
    joinGroup,
    leaveGroup,
    refreshGroups,
  } = useSyncPlay();

  const [isCreating, setIsCreating] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleCreate = async () => {
    if (!groupName.trim()) return;
    setIsLoading(true);
    await createGroup(groupName.trim());
    setGroupName("");
    setIsCreating(false);
    setIsLoading(false);
  };

  const handleJoin = async (groupId: string) => {
    setIsLoading(true);
    await joinGroup(groupId);
    setIsLoading(false);
    onOpenChange(false);
  };

  const handleLeave = async () => {
    setIsLoading(true);
    await leaveGroup();
    setIsLoading(false);
    onOpenChange(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (nextOpen && !isInGroup) {
      refreshGroups();
    }
    if (!nextOpen) {
      setIsCreating(false);
      setGroupName("");
    }
  };

  const groupStateLabel = (state?: string) => {
    switch (state) {
      case "Playing":
        return "Playing";
      case "Paused":
        return "Paused";
      case "Waiting":
        return "Waiting...";
      default:
        return "Idle";
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <SettingsMenuButton
          icon={Users}
          isOpen={open}
          title="SyncPlay"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-72 rounded-2xl overflow-hidden z-100"
        align="end"
        sideOffset={8}
        style={{
          background: "rgba(30, 30, 30, 0.65)",
          backdropFilter: "blur(40px)",
          WebkitBackdropFilter: "blur(40px)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
        }}
      >
        {isInGroup ? (
          <div className="p-4 space-y-3">
            <div>
              <h3 className="font-semibold text-sm text-white">
                {currentGroup?.GroupName || "Watch Party"}
              </h3>
              <p className="text-xs text-white/50">
                {groupStateLabel(currentGroup?.State as string)}
              </p>
            </div>

            {currentGroup?.Participants &&
              currentGroup.Participants.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-white/40 uppercase tracking-wider">
                    Watching
                  </p>
                  {currentGroup.Participants.map((participantId) => (
                    <div
                      key={participantId}
                      className="flex items-center gap-2 text-sm text-white/80 py-1"
                    >
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="truncate">{participantId}</span>
                    </div>
                  ))}
                </div>
              )}

            <Button
              variant="destructive"
              size="sm"
              className="w-full gap-2"
              onClick={handleLeave}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <LogOut className="h-3.5 w-3.5" />
              )}
              Leave Group
            </Button>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            <h3 className="font-semibold text-sm text-white">Join a group</h3>

            {availableGroups.length > 0 && (
              <div className="space-y-1">
                {availableGroups.map((group) => (
                  <button
                    key={group.GroupId}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/10 transition-colors text-left"
                    onClick={() => handleJoin(group.GroupId!)}
                    disabled={isLoading}
                  >
                    <Users className="h-4 w-4 text-white/50 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white/90 truncate">
                        {group.GroupName || "Watch Party"}
                      </p>
                      <p className="text-xs text-white/40">
                        {group.Participants?.length || 0} watching
                        {" · "}
                        {groupStateLabel(group.State as string)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {availableGroups.length > 0 && (
              <div className="border-t border-white/10" />
            )}

            {isCreating ? (
              <div className="space-y-2">
                <Input
                  placeholder="Group name"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") setIsCreating(false);
                  }}
                  className="h-8 text-sm bg-white/5 border-white/10 text-white"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 h-7 text-xs"
                    onClick={handleCreate}
                    disabled={isLoading || !groupName.trim()}
                  >
                    {isLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      "Create"
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-white/70"
                    onClick={() => setIsCreating(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <button
                className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/10 transition-colors text-left"
                onClick={() => setIsCreating(true)}
              >
                <Plus className="h-4 w-4 text-white/50" />
                <div>
                  <p className="text-sm font-medium text-white/90">New group</p>
                  <p className="text-xs text-white/40">
                    Create a watch party
                  </p>
                </div>
              </button>
            )}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

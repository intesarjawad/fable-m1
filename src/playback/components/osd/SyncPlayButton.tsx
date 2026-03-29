"use client";

import React, { useState } from "react";
import { Users, Plus, LogOut, Loader2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { useSyncPlay } from "@/src/contexts/syncplay-context";

export function SyncPlayButton() {
  const {
    isInGroup,
    currentGroup,
    availableGroups,
    createGroup,
    joinGroup,
    leaveGroup,
    refreshGroups,
  } = useSyncPlay();

  const [isOpen, setIsOpen] = useState(false);
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
    setIsOpen(false);
  };

  const handleLeave = async () => {
    setIsLoading(true);
    await leaveGroup();
    setIsLoading(false);
    setIsOpen(false);
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open && !isInGroup) {
      refreshGroups();
    }
    if (!open) {
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
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          className={`rounded-full w-10 h-10 flex items-center justify-center transition-all duration-300 backdrop-blur-sm border ${
            isInGroup
              ? "bg-primary/20 border-primary/40 text-primary"
              : "bg-white/5 border-white/10 text-white/80 hover:bg-white/10"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <Users className="w-4.5 h-4.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-0 bg-card/95 backdrop-blur-xl border-border/50"
        align="end"
        side="bottom"
        sideOffset={8}
        onClick={(e) => e.stopPropagation()}
      >
        {isInGroup ? (
          <div className="p-4 space-y-3">
            <div>
              <h3 className="font-semibold text-sm">
                {currentGroup?.GroupName || "Watch Party"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {groupStateLabel(currentGroup?.State as string)}
              </p>
            </div>

            {currentGroup?.Participants &&
              currentGroup.Participants.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">
                    Watching
                  </p>
                  {currentGroup.Participants.map((participantId) => (
                    <div
                      key={participantId}
                      className="flex items-center gap-2 text-sm py-1"
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
            <h3 className="font-semibold text-sm">Join a group</h3>

            {availableGroups.length > 0 && (
              <div className="space-y-1">
                {availableGroups.map((group) => (
                  <button
                    key={group.GroupId}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-accent transition-colors text-left"
                    onClick={() => handleJoin(group.GroupId!)}
                    disabled={isLoading}
                  >
                    <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {group.GroupName || "Watch Party"}
                      </p>
                      <p className="text-xs text-muted-foreground">
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
              <div className="border-t border-border/50" />
            )}

            {isCreating ? (
              <div className="space-y-2">
                <Input
                  placeholder="Group name"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") setIsCreating(false);
                  }}
                  className="h-8 text-sm"
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
                    className="h-7 text-xs"
                    onClick={() => setIsCreating(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <button
                className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-accent transition-colors text-left"
                onClick={() => setIsCreating(true)}
              >
                <Plus className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">New group</p>
                  <p className="text-xs text-muted-foreground">
                    Create a watch party
                  </p>
                </div>
              </button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

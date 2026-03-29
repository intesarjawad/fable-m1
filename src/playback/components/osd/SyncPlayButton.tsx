"use client";

import React, { useState } from "react";
import { Users, Plus, LogOut, Loader2, Copy, Check, KeyRound } from "lucide-react";
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
    currentJoinCode,
    availableGroups,
    createGroup,
    joinGroup,
    joinWithCode,
    leaveGroup,
    refreshGroups,
  } = useSyncPlay();

  const [view, setView] = useState<"main" | "create" | "joinCode">("main");
  const [groupName, setGroupName] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  const handleCreate = async () => {
    if (!groupName.trim()) return;
    setIsLoading(true);
    await createGroup(groupName.trim(), isPublic);
    setGroupName("");
    setIsPublic(false);
    setView("main");
    setIsLoading(false);
  };

  const handleJoin = async (groupId: string) => {
    setIsLoading(true);
    await joinGroup(groupId);
    setIsLoading(false);
    onOpenChange(false);
  };

  const handleJoinWithCode = async () => {
    if (!joinCodeInput.trim()) return;
    setIsLoading(true);
    const success = await joinWithCode(joinCodeInput.trim());
    if (success) {
      setJoinCodeInput("");
      setView("main");
      onOpenChange(false);
    }
    setIsLoading(false);
  };

  const handleLeave = async () => {
    setIsLoading(true);
    await leaveGroup();
    setIsLoading(false);
    onOpenChange(false);
  };

  const handleCopyCode = () => {
    if (currentJoinCode) {
      navigator.clipboard.writeText(currentJoinCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (nextOpen && !isInGroup) {
      refreshGroups();
    }
    if (!nextOpen) {
      setView("main");
      setGroupName("");
      setJoinCodeInput("");
      setIsPublic(false);
    }
  };

  const groupStateLabel = (state?: string) => {
    switch (state) {
      case "Playing": return "Playing";
      case "Paused": return "Paused";
      case "Waiting": return "Waiting...";
      default: return "Idle";
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <SettingsMenuButton icon={Users} isOpen={open} title="SyncPlay" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-80 rounded-2xl overflow-hidden z-100"
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
          /* --- In Group View --- */
          <div className="p-4 space-y-3">
            <div>
              <h3 className="font-semibold text-sm text-white">
                {currentGroup?.GroupName || "Watch Party"}
              </h3>
              <p className="text-xs text-white/50">
                {groupStateLabel(currentGroup?.State as string)}
              </p>
            </div>

            {currentJoinCode && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-white/5 border border-white/10">
                <KeyRound className="h-3.5 w-3.5 text-white/40 shrink-0" />
                <span className="text-sm font-mono font-bold text-white/90 tracking-widest flex-1">
                  {currentJoinCode}
                </span>
                <button
                  onClick={handleCopyCode}
                  className="text-white/40 hover:text-white/80 transition-colors"
                >
                  {codeCopied ? (
                    <Check className="h-3.5 w-3.5 text-green-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            )}

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
        ) : view === "create" ? (
          /* --- Create Group View --- */
          <div className="p-4 space-y-3">
            <h3 className="font-semibold text-sm text-white">New Watch Party</h3>

            <div className="space-y-2">
              <Input
                placeholder="Party name"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") setView("main");
                }}
                className="h-8 text-sm bg-white/5 border-white/10 text-white"
                autoFocus
              />

              <button
                onClick={() => setIsPublic(!isPublic)}
                className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors text-left"
              >
                <div
                  className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                    isPublic
                      ? "bg-primary border-primary"
                      : "border-white/30 bg-transparent"
                  }`}
                >
                  {isPublic && <Check className="h-3 w-3 text-white" />}
                </div>
                <div>
                  <p className="text-sm text-white/90">Public party</p>
                  <p className="text-xs text-white/40">
                    {isPublic
                      ? "Anyone on the server can see and join"
                      : "Private — others need a join code"}
                  </p>
                </div>
              </button>
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 h-8 text-xs"
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
                className="h-8 text-xs text-white/70"
                onClick={() => setView("main")}
              >
                Back
              </Button>
            </div>
          </div>
        ) : view === "joinCode" ? (
          /* --- Join with Code View --- */
          <div className="p-4 space-y-3">
            <h3 className="font-semibold text-sm text-white">Enter Join Code</h3>

            <Input
              placeholder="e.g. AB3K"
              value={joinCodeInput}
              onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") handleJoinWithCode();
                if (e.key === "Escape") setView("main");
              }}
              className="h-10 text-center text-lg font-mono font-bold tracking-[0.3em] bg-white/5 border-white/10 text-white uppercase"
              maxLength={4}
              autoFocus
            />

            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 h-8 text-xs"
                onClick={handleJoinWithCode}
                disabled={isLoading || joinCodeInput.length < 4}
              >
                {isLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  "Join"
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs text-white/70"
                onClick={() => setView("main")}
              >
                Back
              </Button>
            </div>
          </div>
        ) : (
          /* --- Main View (not in group) --- */
          <div className="p-4 space-y-2">
            <h3 className="font-semibold text-sm text-white">Watch Party</h3>

            {availableGroups.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-white/40 uppercase tracking-wider pt-1">
                  Active parties
                </p>
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
                <div className="border-t border-white/10 mt-1" />
              </div>
            )}

            <button
              className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/10 transition-colors text-left"
              onClick={() => setView("joinCode")}
            >
              <KeyRound className="h-4 w-4 text-white/50" />
              <div>
                <p className="text-sm font-medium text-white/90">Join with code</p>
                <p className="text-xs text-white/40">Enter a party code</p>
              </div>
            </button>

            <button
              className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/10 transition-colors text-left"
              onClick={() => setView("create")}
            >
              <Plus className="h-4 w-4 text-white/50" />
              <div>
                <p className="text-sm font-medium text-white/90">New party</p>
                <p className="text-xs text-white/40">Start a watch party</p>
              </div>
            </button>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Button } from "@/src/components/ui/button";
import { Loader2, MonitorPlay, RefreshCw } from "lucide-react";
import { castPlayNow, listCastTargets, type CastTarget } from "@/src/actions/cast";
import { getDeviceId } from "@/src/lib/device-id";
import { cn } from "@/src/lib/utils";
import { toast } from "sonner";

interface CastTargetPickerProps {
  isOpen: boolean;
  onClose: () => void;
  itemId: string;
  itemTitle: string;
}

export function CastTargetPicker({
  isOpen,
  onClose,
  itemId,
  itemTitle,
}: CastTargetPickerProps) {
  const [targets, setTargets] = useState<CastTarget[]>([]);
  const [loading, setLoading] = useState(false);
  const [castingSessionId, setCastingSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ownDeviceId, setOwnDeviceId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setOwnDeviceId(getDeviceId());
  }, [isOpen]);

  const loadTargets = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await listCastTargets();
    if (!result.success) {
      setError(result.message ?? "Couldn't load devices");
      setTargets([]);
    } else {
      setTargets(result.targets);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    loadTargets();
  }, [isOpen, loadTargets]);

  const handlePick = useCallback(
    async (target: CastTarget) => {
      setCastingSessionId(target.sessionId);
      try {
        const result = await castPlayNow({
          sessionId: target.sessionId,
          itemId,
        });
        if (result.success) {
          toast.success(`Sent to ${target.deviceName}`);
          onClose();
        } else {
          toast.error(result.message ?? "Couldn't reach the device");
        }
      } catch {
        toast.error("Couldn't reach the device");
      } finally {
        setCastingSessionId(null);
      }
    },
    [itemId, onClose],
  );

  const visibleTargets = ownDeviceId
    ? targets.filter((target) => target.deviceId !== ownDeviceId)
    : targets;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MonitorPlay className="h-5 w-5" />
            Cast to a device
          </DialogTitle>
          <DialogDescription>
            Pick where to play{" "}
            <span className="text-foreground font-medium">{itemTitle}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 py-1">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
            </div>
          ) : error ? (
            <div className="bg-destructive/10 text-destructive ring-destructive/30 rounded-lg px-4 py-3 text-sm ring-1">
              {error}
            </div>
          ) : visibleTargets.length === 0 ? (
            <EmptyState onRefresh={loadTargets} />
          ) : (
            visibleTargets.map((target) => {
              const isCasting = castingSessionId === target.sessionId;
              return (
                <button
                  key={target.sessionId}
                  type="button"
                  onClick={() => handlePick(target)}
                  disabled={castingSessionId !== null}
                  className={cn(
                    "ring-border/60 hover:ring-primary/50 hover:bg-muted/40 flex items-center gap-3 rounded-lg p-3 text-left ring-1 transition-all",
                    "disabled:cursor-not-allowed disabled:opacity-60",
                    isCasting && "ring-primary/60 bg-primary/5",
                  )}
                >
                  <div className="bg-muted text-muted-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                    {isCasting ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <MonitorPlay className="h-5 w-5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-foreground flex items-center gap-2 truncate text-sm font-medium">
                      <span className="truncate">{target.deviceName}</span>
                      {target.isActive && (
                        <span className="bg-emerald-500 inline-block h-1.5 w-1.5 shrink-0 rounded-full" />
                      )}
                    </div>
                    <div className="text-muted-foreground truncate text-xs">
                      {target.client}
                      {target.userName ? ` · ${target.userName}` : ""}
                      {target.nowPlayingItemName
                        ? ` · Playing ${target.nowPlayingItemName}`
                        : ""}
                    </div>
                  </div>
                </button>
              );
            })
          )}

          {!loading && !error && (
            <div className="mt-2 flex items-center justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={loadTargets}
                className="text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Refresh
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EmptyState({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="text-muted-foreground border-border/60 flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-8 text-center">
      <MonitorPlay className="h-8 w-8 opacity-60" />
      <div className="text-sm">
        <p className="text-foreground font-medium">No devices found</p>
        <p className="mt-1 text-xs">
          Launch a Jellyfin player on the device you want to cast to and sign in
          with the same account.
        </p>
      </div>
      <div className="text-xs">
        Try{" "}
        <a
          href="https://github.com/jellyfin/jellyfin-media-player/releases"
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:underline"
        >
          Jellyfin Media Player
        </a>{" "}
        or{" "}
        <a
          href="https://github.com/jellyfin/jellyfin-mpv-shim"
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:underline"
        >
          MPV Shim
        </a>
        .
      </div>
      <Button variant="outline" size="sm" onClick={onRefresh}>
        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
        Refresh
      </Button>
    </div>
  );
}

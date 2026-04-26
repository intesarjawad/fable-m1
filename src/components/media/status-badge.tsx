import { cn } from "@/src/lib/utils";
import { Badge } from "@/src/components/ui/badge";

const NAMED_STATES = new Set([
  "Completed",
  "PartiallyCompleted",
  "Requested",
  "Downloading",
  "Paused",
  "Unknown",
]);

type StatusBadgeSize = "sm" | "default";

interface StatusBadgeProps {
  state: string;
  size?: StatusBadgeSize;
  className?: string;
}

export function StatusBadge({ state, size = "sm", className }: StatusBadgeProps) {
  const isUnnamedState = !NAMED_STATES.has(state);
  const badgeVariant = state === "Unknown" ? "destructive" : "secondary";

  const sizeClasses =
    size === "default" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-xs";

  return (
    <Badge
      variant={badgeVariant}
      className={cn(
        "inline-flex items-center justify-center backdrop-blur-sm",
        sizeClasses,
        state === "Completed" && "bg-emerald-600/80 text-emerald-50 hover:bg-emerald-600/70",
        state === "PartiallyCompleted" && "bg-emerald-600/40 text-emerald-50 hover:bg-emerald-600/50",
        state === "Requested" && "bg-sky-600/80 text-sky-50 hover:bg-sky-600/70",
        state === "Downloading" && "bg-amber-600/80 text-amber-50 hover:bg-amber-600/70",
        state === "Paused" && "bg-slate-500/80 text-slate-50 hover:bg-slate-500/70",
        // Unknown uses destructive variant — class overrides handled by variant
        // Everything else (unrecognised pipeline states) falls back to amber
        isUnnamedState && state !== "Unknown" && "bg-amber-600/80 text-amber-50 hover:bg-amber-600/70",
        className
      )}
    >
      {state}
    </Badge>
  );
}

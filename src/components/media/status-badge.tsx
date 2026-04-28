import { cn } from "@/src/lib/utils";
import { Badge } from "@/src/components/ui/badge";

export type AvailabilityState =
  | "Available"
  | "Partial"
  | "Requested"
  | "Downloading";

const STATE_CLASSES: Record<AvailabilityState, string> = {
  Available: "bg-emerald-600/80 text-emerald-50 hover:bg-emerald-600/70",
  Partial: "bg-emerald-600/40 text-emerald-50 hover:bg-emerald-600/50",
  Requested: "bg-sky-600/80 text-sky-50 hover:bg-sky-600/70",
  Downloading: "bg-amber-600/80 text-amber-50 hover:bg-amber-600/70",
};

type StatusBadgeSize = "sm" | "default";

interface StatusBadgeProps {
  state: AvailabilityState;
  size?: StatusBadgeSize;
  className?: string;
}

export function StatusBadge({ state, size = "sm", className }: StatusBadgeProps) {
  const sizeClasses =
    size === "default" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-xs";

  return (
    <Badge
      variant="secondary"
      className={cn(
        "inline-flex items-center justify-center backdrop-blur-sm",
        sizeClasses,
        STATE_CLASSES[state],
        className
      )}
    >
      {state}
    </Badge>
  );
}

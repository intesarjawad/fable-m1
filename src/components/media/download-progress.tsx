import { cn } from "@/src/lib/utils";
import type { MediaDownloadProgress } from "@/src/types/details";

interface DownloadProgressProps {
  downloads: MediaDownloadProgress[];
  className?: string;
}

const BYTES_PER_GB = 1024 ** 3;
const BYTES_PER_MB = 1024 ** 2;

function formatSize(bytes: number): string {
  if (bytes >= BYTES_PER_GB) return `${(bytes / BYTES_PER_GB).toFixed(1)} GB`;
  if (bytes >= BYTES_PER_MB) return `${(bytes / BYTES_PER_MB).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function formatEta(iso: string | null): string | null {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return null;
  const diffMs = target - Date.now();
  if (diffMs <= 0) return "any moment";

  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "<1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  if (hours < 24) {
    return remMin > 0 ? `${hours}h ${remMin}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

export function DownloadProgress({ downloads, className }: DownloadProgressProps) {
  if (downloads.length === 0) return null;

  // Aggregate when there are multiple parallel grabs (e.g. one per season).
  const totalSize = downloads.reduce((sum, d) => sum + d.size, 0);
  const totalLeft = downloads.reduce((sum, d) => sum + d.sizeLeft, 0);
  if (totalSize <= 0) return null;

  const downloaded = totalSize - totalLeft;
  const percent = Math.max(0, Math.min(100, (downloaded / totalSize) * 100));

  // Pick the soonest non-null ETA across all grabs.
  const etaIso = downloads
    .map((d) => d.estimatedCompletionTime)
    .filter((iso): iso is string => !!iso)
    .sort()[0] ?? null;
  const eta = formatEta(etaIso);

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-3 py-1 text-xs text-amber-200 ring-1 ring-amber-500/30 backdrop-blur-sm",
        className,
      )}
      title={`${downloads.length} active grab${downloads.length === 1 ? "" : "s"}`}
    >
      <span className="font-medium">{percent.toFixed(0)}%</span>
      <span className="text-amber-200/60">·</span>
      <span className="tabular-nums">
        {formatSize(downloaded)} / {formatSize(totalSize)}
      </span>
      {eta && (
        <>
          <span className="text-amber-200/60">·</span>
          <span>ETA {eta}</span>
        </>
      )}
    </div>
  );
}

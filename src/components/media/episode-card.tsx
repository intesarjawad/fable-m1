import { Mountain } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { OptimizedImage } from "@/src/components/optimized-image";

interface EpisodeCardProps {
  title: string;
  episodeNumber?: number;
  stillUrl?: string | null;
  airedDate?: string | null;
  runtime?: string | null;
  isAvailable?: boolean;
  overview?: string | null;
  onClick?: () => void;
  className?: string;
}

export function EpisodeCard({
  title,
  episodeNumber,
  stillUrl,
  airedDate,
  runtime,
  isAvailable,
  overview,
  onClick,
  className,
}: EpisodeCardProps) {
  return (
    <div
      className={cn(
        "group bg-card ring-border hover:ring-primary/30 relative flex h-full w-full transform-gpu flex-col overflow-hidden rounded-xl shadow-sm ring-1 transition-all duration-500 ease-in-out hover:scale-[1.01] hover:shadow-2xl hover:shadow-black/50",
        onClick && "cursor-pointer",
        className
      )}
      onClick={onClick}
    >
      {/* 16:9 still image */}
      <div className="relative aspect-video w-full flex-grow overflow-hidden">
        {stillUrl ? (
          <>
            <OptimizedImage
              src={stillUrl}
              alt={title}
              className="h-full w-full transform-gpu object-cover transition-transform duration-500 group-hover:scale-105"
            />
          </>
        ) : (
          <div className="bg-muted text-muted-foreground flex h-full w-full items-center justify-center">
            <Mountain size={32} strokeWidth={1} />
          </div>
        )}

        {/* Gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent opacity-90 transition-opacity duration-500 group-hover:opacity-100" />
        <div className="from-primary/20 absolute inset-0 bg-gradient-to-t via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

        {/* Availability indicator — small green dot when this episode is in the library */}
        {isAvailable && (
          <div className="absolute top-2 right-2 z-10" aria-label="Available to watch">
            <span className="block h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_2px_rgba(0,0,0,0.45)]" />
          </div>
        )}

        {/* Content overlay at bottom of still */}
        <div className="absolute inset-0 flex flex-col justify-end">
          <div className="relative z-10 flex flex-col gap-1.5 p-3 md:p-4">
            <h3 className="relative z-20 line-clamp-1 text-base font-extrabold text-white drop-shadow-md md:text-lg">
              {episodeNumber != null && (
                <span className="text-primary mr-2 drop-shadow-md">
                  {episodeNumber}.
                </span>
              )}
              {title}
            </h3>

            {(airedDate || runtime) && (
              <div className="relative z-20 flex flex-wrap items-center gap-2 text-xs text-zinc-300/90">
                {airedDate && <span>{airedDate}</span>}
                {airedDate && runtime && <span className="text-white/30">·</span>}
                {runtime && <span>{runtime}</span>}
              </div>
            )}

            {/* Overview — hidden by default, revealed on hover */}
            {overview && (
              <div className="grid grid-rows-[0fr] text-sm text-zinc-300/90 opacity-0 transition-all duration-500 ease-in-out group-hover:grid-rows-[1fr] group-hover:opacity-100">
                <p className="line-clamp-3 overflow-hidden">{overview}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

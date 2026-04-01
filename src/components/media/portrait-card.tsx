import { ReactNode } from "react";
import { Mountain } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { Skeleton } from "@/src/components/ui/skeleton";

interface PortraitCardProps {
  title: string;
  subtitle?: string | null;
  posterUrl?: string | null;
  showContent?: boolean;
  className?: string;
  topRight?: ReactNode;
  children?: ReactNode;
}

export function PortraitCard({
  title,
  subtitle,
  posterUrl,
  showContent = true,
  className,
  topRight,
  children,
}: PortraitCardProps) {
  return (
    <div
      className={cn(
        "group bg-card ring-border hover:ring-primary/30 relative aspect-[2/3] w-full overflow-hidden rounded-xl shadow-sm ring-1 transition-all duration-500 hover:shadow-2xl hover:shadow-black/50",
        className
      )}
    >
      {posterUrl ? (
        <>
          <img
            src={posterUrl}
            alt={title}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-700 ease-out will-change-transform group-hover:scale-110"
          />
          {/* Primary gradient for text legibility */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent opacity-90 transition-opacity duration-500 group-hover:opacity-100" />
          {/* Subtle primary tint on hover */}
          <div className="from-primary/20 absolute inset-0 bg-gradient-to-t via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
        </>
      ) : (
        <div className="bg-muted text-muted-foreground flex h-full w-full items-center justify-center">
          <Mountain size={32} strokeWidth={1} />
        </div>
      )}

      {topRight && (
        <div className="absolute top-3 right-3 z-20 transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1">
          {topRight}
        </div>
      )}

      {showContent && (
        <div className="absolute inset-x-0 bottom-0 z-20 p-4 transition-transform duration-300 group-hover:-translate-y-1">
          <h3 className="line-clamp-2 leading-tight font-bold text-balance text-white drop-shadow-md">
            {title}
          </h3>
          {subtitle && (
            <p className="mt-1 line-clamp-1 text-xs font-medium text-zinc-300/90">
              {subtitle}
            </p>
          )}
          {children}
        </div>
      )}
    </div>
  );
}

export function PortraitCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative aspect-[2/3] overflow-hidden rounded-xl bg-zinc-900 shadow-md",
        className
      )}
    >
      {/* Matches PortraitCard's ring border */}
      <div className="pointer-events-none absolute inset-0 z-50 rounded-[inherit] border border-white/10" />

      <Skeleton className="absolute inset-0 h-full w-full rounded-none" />

      {/* Content area skeleton matching PortraitCard layout */}
      <div className="absolute inset-0 flex flex-col justify-end">
        <div
          className="absolute inset-0 bg-black/90"
          style={{
            maskImage: "linear-gradient(to bottom, transparent 40%, black 90%)",
          }}
        />
        <div className="relative z-10 flex flex-col items-center gap-1.5 p-3">
          <Skeleton className="h-4 w-4/5 rounded" />
          <Skeleton className="h-3 w-1/2 rounded" />
        </div>
      </div>
    </div>
  );
}

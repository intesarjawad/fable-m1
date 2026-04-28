"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  Film,
  Loader2,
  Tv,
  X,
} from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { DownloadProgress } from "@/src/components/media/download-progress";
import { cn } from "@/src/lib/utils";
import { toast } from "sonner";
import type {
  SeerrRequestList,
  SeerrRequestListItem,
} from "@/src/actions/seerr";
import { SEERR_STATUS } from "@/src/lib/tmdb";
import type { MediaDownloadProgress } from "@/src/types/details";

type FilterValue = "all" | "pending" | "processing" | "available";

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "available", label: "Available" },
];

const PAGE_SIZE = 20;

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function statusPill(status: number): { label: string; className: string; icon: React.ReactNode } {
  switch (status) {
    case SEERR_STATUS.Pending:
      return {
        label: "Pending",
        className: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
        icon: <Clock className="h-3.5 w-3.5" />,
      };
    case SEERR_STATUS.Processing:
      return {
        label: "Processing",
        className: "bg-amber-500/15 text-amber-200 ring-amber-500/30",
        icon: <Download className="h-3.5 w-3.5" />,
      };
    case SEERR_STATUS.PartiallyAvailable:
      return {
        label: "Partial",
        className: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
        icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      };
    case SEERR_STATUS.Available:
      return {
        label: "Available",
        className: "bg-emerald-500/20 text-emerald-200 ring-emerald-500/40",
        icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      };
    default:
      return {
        label: "Unknown",
        className: "bg-zinc-500/15 text-zinc-300 ring-zinc-500/30",
        icon: <AlertCircle className="h-3.5 w-3.5" />,
      };
  }
}

function normalizeDownloads(
  raw: SeerrRequestListItem["media"]["downloadStatus"],
): MediaDownloadProgress[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((d) => typeof d.size === "number" && typeof d.sizeLeft === "number")
    .map((d) => ({
      title: d.title ?? "Unknown release",
      size: d.size as number,
      sizeLeft: d.sizeLeft as number,
      estimatedCompletionTime: d.estimatedCompletionTime ?? null,
    }));
}

function RequestCard({
  request,
  titleByTmdb,
  onCancel,
  cancellingId,
}: {
  request: SeerrRequestListItem;
  titleByTmdb: Map<number, string>;
  onCancel: (id: number) => void;
  cancellingId: number | null;
}) {
  const pill = statusPill(request.media.status);
  const downloads = normalizeDownloads(request.media.downloadStatus);
  const isCancellable =
    request.media.status === SEERR_STATUS.Pending ||
    request.media.status === SEERR_STATUS.Processing;
  const isCancelling = cancellingId === request.id;

  const tmdbId = request.media.tmdbId;
  const title = titleByTmdb.get(tmdbId) ?? `${request.type === "movie" ? "Movie" : "TV"} #${tmdbId}`;
  const detailHref = `/details/${tmdbId}/${request.type}`;

  return (
    <div className="bg-card ring-border/60 hover:ring-primary/40 group flex flex-col gap-3 rounded-xl p-4 ring-1 transition-all sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3 sm:items-center">
        <div className="bg-muted text-muted-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
          {request.type === "movie" ? (
            <Film className="h-5 w-5" />
          ) : (
            <Tv className="h-5 w-5" />
          )}
        </div>
        <div className="min-w-0">
          <Link
            href={detailHref}
            className="text-foreground hover:text-primary block truncate text-base font-semibold transition-colors"
          >
            {title}
          </Link>
          <div className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 ring-1 backdrop-blur-sm",
                pill.className,
              )}
            >
              {pill.icon}
              <span className="font-medium">{pill.label}</span>
            </span>
            <span>·</span>
            <span>Requested {formatRelative(request.createdAt)}</span>
            {request.requestedBy?.displayName && (
              <>
                <span>·</span>
                <span>by {request.requestedBy.displayName}</span>
              </>
            )}
            {request.is4k && (
              <span className="rounded bg-purple-500/15 px-1.5 py-0.5 font-medium text-purple-300 ring-1 ring-purple-500/30">
                4K
              </span>
            )}
          </div>
          {downloads.length > 0 && (
            <DownloadProgress downloads={downloads} className="mt-2" />
          )}
        </div>
      </div>

      {isCancellable && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onCancel(request.id)}
          disabled={isCancelling}
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive shrink-0 self-end sm:self-auto"
        >
          {isCancelling ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <X className="h-4 w-4" />
          )}
          <span className="ml-1">Cancel</span>
        </Button>
      )}
    </div>
  );
}

export default function RequestsPage() {
  const [filter, setFilter] = useState<FilterValue>("all");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<SeerrRequestList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [titleByTmdb, setTitleByTmdb] = useState<Map<number, string>>(new Map());

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const search = new URLSearchParams({
        filter,
        sort: "added",
        take: String(PAGE_SIZE),
        skip: String(page * PAGE_SIZE),
      });
      const res = await fetch(`/api/seerr/requests?${search.toString()}`);
      if (!res.ok) throw new Error(`Failed to load requests (${res.status})`);
      const json: SeerrRequestList | null = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load requests");
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  // Resolve TMDB titles in parallel for visible items.
  useEffect(() => {
    if (!data?.results) return;
    const missing = data.results
      .map((r) => r.media.tmdbId)
      .filter((id) => !titleByTmdb.has(id));
    if (missing.length === 0) return;

    let cancelled = false;
    Promise.all(
      data.results
        .filter((r) => missing.includes(r.media.tmdbId))
        .map(async (r) => {
          const path = r.type === "movie" ? "movie" : "tv";
          try {
            const res = await fetch(`/api/tmdb/${path}/${r.media.tmdbId}`);
            if (!res.ok) return [r.media.tmdbId, null] as const;
            const json = await res.json();
            const t = json?.title ?? json?.name ?? null;
            return [r.media.tmdbId, t] as const;
          } catch {
            return [r.media.tmdbId, null] as const;
          }
        }),
    ).then((entries) => {
      if (cancelled) return;
      setTitleByTmdb((prev) => {
        const next = new Map(prev);
        for (const [id, t] of entries) if (t) next.set(id, t);
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [data, titleByTmdb]);

  const handleCancel = useCallback(
    async (requestId: number) => {
      setCancellingId(requestId);
      try {
        const res = await fetch(`/api/seerr/requests/${requestId}`, {
          method: "DELETE",
        });
        const result = await res.json().catch(() => ({}));
        if (!res.ok || result?.success === false) {
          toast.error(result?.message ?? "Failed to cancel request");
          return;
        }
        toast.success("Request cancelled");
        // Optimistically drop it from the current list
        setData((prev) =>
          prev
            ? {
                ...prev,
                results: prev.results.filter((r) => r.id !== requestId),
              }
            : prev,
        );
      } catch {
        toast.error("Failed to cancel request");
      } finally {
        setCancellingId(null);
      }
    },
    [],
  );

  const totalPages = data?.pageInfo.pages ?? 1;
  const showPagination = totalPages > 1;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-foreground text-3xl font-bold tracking-tight">
          My Requests
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          What you&apos;ve asked Sonarr and Radarr to find for you.
        </p>
      </div>

      <Tabs
        value={filter}
        onValueChange={(v) => {
          setFilter(v as FilterValue);
          setPage(0);
        }}
        className="mb-6"
      >
        <TabsList>
          {FILTERS.map((f) => (
            <TabsTrigger key={f.value} value={f.value}>
              {f.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <div className="bg-destructive/10 text-destructive ring-destructive/30 rounded-xl p-6 text-sm ring-1">
          {error}
        </div>
      ) : !data || data.results.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed border-zinc-800 px-6 py-12 text-center">
          <p className="text-sm">No {filter === "all" ? "" : filter} requests yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {data.results.map((r) => (
            <RequestCard
              key={r.id}
              request={r}
              titleByTmdb={titleByTmdb}
              onCancel={handleCancel}
              cancellingId={cancellingId}
            />
          ))}
        </div>
      )}

      {showPagination && (
        <div className="mt-8 flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0 || loading}
          >
            Previous
          </Button>
          <span className="text-muted-foreground px-3 text-sm tabular-nums">
            Page {page + 1} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1 || loading}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

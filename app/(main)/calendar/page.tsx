"use client";

import { useState, useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight, Film, Tv } from "lucide-react";
import Link from "next/link";
import { cn } from "@/src/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalendarItem {
  item_id: number;
  tvdb_id: string | null;
  tmdb_id: string | null;
  show_title: string;
  item_type: string;
  aired_at: string;
  season?: number | null;
  episode?: number | null;
  last_state?: string | null;
}

type FilterKey = "movie" | "episode" | "show" | "season";

interface CalendarDay {
  year: number;
  month: number;
  day: number;
  dateKey: string;
  isCurrentMonth: boolean;
  items: CalendarItem[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TYPE_STYLE: Record<string, { border: string; bg: string; hover: string; text: string; icon: string }> = {
  episode: {
    border: "border-blue-500/30",
    bg: "bg-blue-500/20",
    hover: "hover:bg-blue-500/30",
    text: "text-blue-300",
    icon: "text-blue-400",
  },
  show: {
    border: "border-purple-500/30",
    bg: "bg-purple-500/20",
    hover: "hover:bg-purple-500/30",
    text: "text-purple-300",
    icon: "text-purple-400",
  },
  season: {
    border: "border-green-500/30",
    bg: "bg-green-500/20",
    hover: "hover:bg-green-500/30",
    text: "text-green-300",
    icon: "text-green-400",
  },
  movie: {
    border: "border-orange-500/30",
    bg: "bg-orange-500/20",
    hover: "hover:bg-orange-500/30",
    text: "text-orange-300",
    icon: "text-orange-400",
  },
};

const FILTER_OPTIONS: Array<{ key: FilterKey; label: string }> = [
  { key: "movie", label: "Movies" },
  { key: "episode", label: "Episodes" },
  { key: "show", label: "Shows" },
  { key: "season", label: "Seasons" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDateKey(iso: string): { year: number; month: number; day: number } | null {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function itemDetailUrl(item: CalendarItem): string | null {
  const mediaType = item.item_type === "movie" ? "movie" : "tv";
  if (mediaType === "tv") {
    if (item.tvdb_id) return `/details/${item.tvdb_id}/tv?indexer=tvdb`;
    if (item.tmdb_id) return `/details/${item.tmdb_id}/tv`;
  } else {
    if (item.tmdb_id) return `/details/${item.tmdb_id}/movie`;
    if (item.tvdb_id) return `/details/${item.tvdb_id}/movie?indexer=tvdb`;
  }
  return null;
}

function formatEpisodeCode(season: number | null | undefined, episode: number | null | undefined): string {
  if (!season) return "";
  const seasonPad = String(season).padStart(2, "0");
  if (!episode) return `S${seasonPad}`;
  const episodePad = String(episode).padStart(2, "0");
  return `S${seasonPad}E${episodePad}`;
}

function buildCalendarGrid(year: number, month: number): Array<{ year: number; month: number; day: number; dateKey: string; isCurrentMonth: boolean }> {
  // month is 1-indexed
  const firstDayOfMonth = new Date(year, month - 1, 1);
  const lastDayOfMonth = new Date(year, month, 0);
  const startOffset = firstDayOfMonth.getDay(); // 0 = Sunday
  const totalDaysInMonth = lastDayOfMonth.getDate();

  // Calculate trailing days to complete the last row
  const trailingDays = (7 - ((startOffset + totalDaysInMonth) % 7)) % 7;
  const totalCells = startOffset + totalDaysInMonth + trailingDays;

  const cells = [];
  for (let cellIndex = 0; cellIndex < totalCells; cellIndex++) {
    const dayOffset = cellIndex - startOffset;
    const date = new Date(year, month - 1, 1 + dayOffset);
    cells.push({
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      dateKey: toDateKey(date.getFullYear(), date.getMonth() + 1, date.getDate()),
      isCurrentMonth: date.getMonth() + 1 === month,
    });
  }
  return cells;
}

function getTodayKey(): string {
  const now = new Date();
  return toDateKey(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ItemRow({ item, compact = false }: { item: CalendarItem; compact?: boolean }) {
  const style = TYPE_STYLE[item.item_type] ?? TYPE_STYLE.movie;
  const href = itemDetailUrl(item);
  const episodeCode = formatEpisodeCode(item.season, item.episode);
  const isCompleted = item.last_state === "Completed";

  const rowClasses = cn(
    "flex items-center rounded border transition-colors",
    compact ? "gap-1 truncate p-1" : "gap-2 p-2",
    style.border,
    style.bg,
    style.hover,
    compact && style.text,
    isCompleted && "line-through opacity-60"
  );

  const iconClasses = cn(
    "shrink-0",
    compact ? "h-3 w-3" : "h-4 w-4",
    style.icon
  );

  const content = (
    <>
      {item.item_type === "movie" ? (
        <Film className={iconClasses} />
      ) : (
        <Tv className={iconClasses} />
      )}
      <div className="min-w-0 flex-1">
        <div className={cn("text-xs", compact ? "truncate" : "font-medium")}>
          {item.show_title}
          {compact && episodeCode && ` ${episodeCode}`}
        </div>
        {!compact && episodeCode && (
          <div className="text-xs text-zinc-500">{episodeCode}</div>
        )}
      </div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={cn(rowClasses, "no-underline")}>
        {content}
      </Link>
    );
  }

  return <div className={rowClasses}>{content}</div>;
}

function OverflowDialog({
  day,
  visibleCount,
}: {
  day: CalendarDay;
  visibleCount: number;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const overflowCount = day.items.length - visibleCount;
  const dateLabel = `${DAY_NAMES[new Date(day.year, day.month - 1, day.day).getDay()]}, ${MONTH_NAMES[day.month - 1]} ${day.day}`;

  if (overflowCount <= 0) return null;

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors text-left"
      >
        +{overflowCount} more
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setIsOpen(false)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 text-lg font-bold text-white">{dateLabel}</div>
            <div className="mb-4 text-sm text-zinc-500">
              {day.items.length} item{day.items.length !== 1 ? "s" : ""}
            </div>
            <div className="max-h-96 space-y-2 overflow-y-auto">
              {day.items.map((item) => (
                <ItemRow key={item.item_id} item={item} />
              ))}
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="mt-4 w-full rounded-xl border border-white/10 py-2 text-sm text-zinc-400 hover:bg-white/5 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RivenCalendarPage() {
  const todayKey = getTodayKey();
  const todayDate = new Date();

  const [currentYear, setCurrentYear] = useState(todayDate.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(todayDate.getMonth() + 1);
  const [allItems, setAllItems] = useState<CalendarItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<Record<FilterKey, boolean>>({
    movie: true,
    episode: true,
    show: true,
    season: true,
  });

  // ── Fetch calendar data ────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function fetchCalendarData() {
      setIsLoading(true);
      setFetchError(null);

      try {
        const response = await fetch("/api/riven/calendar");
        if (!response.ok) {
          throw new Error(`Riven returned ${response.status}`);
        }

        const data = await response.json();

        // Riven returns { data: { "key": item, ... } } or an array — handle both shapes
        let rawItems: CalendarItem[] = [];
        if (Array.isArray(data)) {
          rawItems = data;
        } else if (data?.data && typeof data.data === "object") {
          rawItems = Object.values(data.data) as CalendarItem[];
        } else if (data && typeof data === "object") {
          rawItems = Object.values(data) as CalendarItem[];
        }

        if (cancelled) return;
        setAllItems(rawItems.filter((item) => item?.aired_at));
      } catch (err) {
        if (cancelled) return;
        setFetchError(err instanceof Error ? err.message : "Failed to load calendar");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchCalendarData();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Group items by date, applying filters ─────────────────────────────────

  const itemsByDate = useMemo(() => {
    const grouped: Record<string, CalendarItem[]> = {};
    for (const item of allItems) {
      if (!activeFilters[item.item_type as FilterKey]) continue;
      const parsed = parseDateKey(item.aired_at);
      if (!parsed) continue;
      const key = toDateKey(parsed.year, parsed.month, parsed.day);
      (grouped[key] ??= []).push(item);
    }
    return grouped;
  }, [allItems, activeFilters]);

  // ── Build calendar grid ────────────────────────────────────────────────────

  const calendarDays: CalendarDay[] = useMemo(() => {
    const cells = buildCalendarGrid(currentYear, currentMonth);
    return cells.map((cell) => ({
      ...cell,
      items: itemsByDate[cell.dateKey] ?? [],
    }));
  }, [currentYear, currentMonth, itemsByDate]);

  const mobileDays = useMemo(
    () => calendarDays.filter((day) => day.isCurrentMonth && day.items.length > 0),
    [calendarDays]
  );

  // ── Month navigation ───────────────────────────────────────────────────────

  function navigateMonth(direction: "prev" | "next") {
    let nextMonth = currentMonth + (direction === "next" ? 1 : -1);
    let nextYear = currentYear;
    if (nextMonth < 1) {
      nextMonth = 12;
      nextYear--;
    } else if (nextMonth > 12) {
      nextMonth = 1;
      nextYear++;
    }
    setCurrentMonth(nextMonth);
    setCurrentYear(nextYear);
  }

  function toggleFilter(key: FilterKey) {
    setActiveFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      {/* Immersive background — matches riven calendar page */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-900 via-zinc-950 to-black" />
        <div className="absolute top-[-20%] left-[-10%] h-[600px] w-[600px] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute right-[-5%] bottom-[-10%] h-[500px] w-[500px] rounded-full bg-blue-500/5 blur-[100px]" />
      </div>

      <div className="relative z-10 px-4 pt-20 pb-6 max-w-full overflow-hidden">
      <div className="mx-auto w-full max-w-[1600px] space-y-4">
        {/* ── Header card ── */}
        <div className="rounded-2xl border border-white/10 bg-card shadow-lg">
          {/* Month navigation + title */}
          <div className="flex items-center justify-between px-6 py-4">
            <button
              onClick={() => navigateMonth("prev")}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <h1 className="text-xl font-bold text-white md:text-2xl">
              {MONTH_NAMES[currentMonth - 1]} {currentYear}
            </h1>

            <button
              onClick={() => navigateMonth("next")}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Filter chips */}
          <div className="flex flex-wrap items-center justify-center gap-3 border-t border-white/5 px-6 py-3">
            {FILTER_OPTIONS.map(({ key, label }) => {
              const style = TYPE_STYLE[key];
              const isActive = activeFilters[key];
              return (
                <button
                  key={key}
                  onClick={() => toggleFilter(key)}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-medium transition-all",
                    isActive
                      ? cn(style.border, style.bg, style.text)
                      : "border-white/5 bg-transparent text-zinc-600 hover:border-white/10 hover:text-zinc-400"
                  )}
                >
                  {key === "movie" ? (
                    <Film className={cn("h-3.5 w-3.5", isActive ? style.icon : "text-current")} />
                  ) : (
                    <Tv className={cn("h-3.5 w-3.5", isActive ? style.icon : "text-current")} />
                  )}
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Calendar body ── */}
        {isLoading ? (
          <CalendarSkeleton />
        ) : fetchError ? (
          <div className="flex min-h-64 items-center justify-center rounded-2xl border border-white/10 bg-card">
            <div className="text-center">
              <p className="font-medium text-white">Could not load calendar</p>
              <p className="mt-1 text-sm text-zinc-500">{fetchError}</p>
            </div>
          </div>
        ) : (
          <>
            {/* Desktop grid — hidden below xl */}
            <div className="hidden xl:block">
              <div className="mb-2 grid grid-cols-7 gap-2">
                {DAY_NAMES.map((name) => (
                  <div
                    key={name}
                    className="py-2 text-center text-sm font-semibold text-zinc-500"
                  >
                    {name}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-2">
                {calendarDays.map((day) => (
                  <DesktopDayCell key={day.dateKey} day={day} todayKey={todayKey} />
                ))}
              </div>
            </div>

            {/* Mobile list — shown below xl */}
            <div className="xl:hidden space-y-2">
              {mobileDays.length === 0 ? (
                <div className="flex min-h-40 items-center justify-center rounded-2xl border border-white/10 bg-card text-zinc-500 text-sm">
                  No items this month
                </div>
              ) : (
                mobileDays.map((day) => (
                  <MobileDayCard key={day.dateKey} day={day} todayKey={todayKey} />
                ))
              )}
            </div>
          </>
        )}
      </div>
      </div>
    </div>
  );
}

// ─── Desktop day cell ─────────────────────────────────────────────────────────

function DesktopDayCell({ day, todayKey }: { day: CalendarDay; todayKey: string }) {
  const isToday = day.dateKey === todayKey;
  const VISIBLE_ITEM_COUNT = 3;

  return (
    <div
      className={cn(
        "min-h-[7.5rem] rounded-xl border p-2 transition-colors",
        day.isCurrentMonth
          ? "border-white/10 bg-card hover:bg-white/5"
          : "border-white/5 bg-white/[0.02] text-zinc-600",
        isToday && "ring-2 ring-primary ring-offset-2 ring-offset-background"
      )}
    >
      <div className={cn("mb-2 text-sm font-medium", isToday ? "text-primary" : day.isCurrentMonth ? "text-white" : "text-zinc-600")}>
        {day.day}
      </div>
      <div className="space-y-1">
        {day.items.slice(0, VISIBLE_ITEM_COUNT).map((item) => (
          <ItemRow key={item.item_id} item={item} compact />
        ))}
        <OverflowDialog day={day} visibleCount={VISIBLE_ITEM_COUNT} />
      </div>
    </div>
  );
}

// ─── Mobile day card ──────────────────────────────────────────────────────────

function MobileDayCard({ day, todayKey }: { day: CalendarDay; todayKey: string }) {
  const isToday = day.dateKey === todayKey;
  const dayOfWeek = DAY_NAMES[new Date(day.year, day.month - 1, day.day).getDay()];
  const dateLabel = `${dayOfWeek}, ${MONTH_NAMES[day.month - 1]} ${day.day}`;

  return (
    <div
      className={cn(
        "rounded-xl border border-white/10 bg-card p-4",
        isToday && "ring-2 ring-primary ring-offset-2 ring-offset-background"
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className={cn("text-base font-semibold", isToday ? "text-primary" : "text-white")}>
          {dateLabel}
        </div>
        <div className="text-sm text-zinc-500">
          {day.items.length} item{day.items.length !== 1 ? "s" : ""}
        </div>
      </div>
      <div className="space-y-2">
        {day.items.map((item) => (
          <ItemRow key={item.item_id} item={item} />
        ))}
      </div>
    </div>
  );
}

// ─── Calendar skeleton ────────────────────────────────────────────────────────

function CalendarSkeleton() {
  return (
    <div className="hidden xl:block">
      <div className="mb-2 grid grid-cols-7 gap-2">
        {DAY_NAMES.map((name) => (
          <div key={name} className="py-2 text-center text-sm font-semibold text-zinc-500">
            {name}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 35 }).map((_, index) => (
          <div
            key={index}
            className="min-h-[7.5rem] animate-pulse rounded-xl border border-white/5 bg-zinc-900/40"
          />
        ))}
      </div>
    </div>
  );
}

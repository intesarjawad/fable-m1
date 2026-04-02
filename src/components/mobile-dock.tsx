"use client";
import { useRef, useState, useEffect, useCallback } from "react";
import { Search, Menu, X } from "lucide-react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useSidebar } from "./ui/sidebar";

export function MobileDock() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { openMobile, setOpenMobile } = useSidebar();

  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Sync input from URL when navigating (back/forward, chip clicks)
  useEffect(() => {
    const urlQuery = searchParams.get("query") ?? "";
    if (document.activeElement !== inputRef.current) {
      setQuery(urlQuery);
    }
  }, [searchParams]);

  const navigateToSearch = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      const isOnExplore = pathname === "/explore";
      if (trimmed) {
        router[isOnExplore ? "replace" : "push"](
          `/explore?query=${encodeURIComponent(trimmed)}`,
        );
      } else {
        router[isOnExplore ? "replace" : "push"]("/explore");
      }
    },
    [router, pathname],
  );

  function handleChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => navigateToSearch(value), 300);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    navigateToSearch(query);
    inputRef.current?.blur();
  }

  return (
    <div className="fixed right-0 bottom-6 left-0 z-50 flex justify-center px-4 md:hidden pb-[env(safe-area-inset-bottom)]">
      <form
        onSubmit={handleSubmit}
        className="flex h-11 w-full max-w-md items-center gap-2 rounded-full border border-white/5 bg-white/5 p-1 pl-4 shadow-lg backdrop-blur-xl transition-all duration-300 focus-within:border-white/10 focus-within:bg-black/40 focus-within:ring-1 focus-within:ring-white/20 hover:bg-white/10"
      >
        <Search className="size-4 shrink-0 text-white/50" />

        <input
          ref={inputRef}
          type="text"
          name="query"
          placeholder="Search..."
          aria-label="Search"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          autoComplete="off"
          className="h-full flex-1 bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-white/40"
        />

        {/* Divider */}
        <div className="h-5 w-px bg-white/10" />

        {/* Menu toggle */}
        <button
          type="button"
          onClick={() => setOpenMobile(!openMobile)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-white/50 transition-all hover:bg-white/10 hover:text-white"
        >
          {openMobile ? (
            <X className="size-5" />
          ) : (
            <Menu className="size-5" />
          )}
        </button>
      </form>
    </div>
  );
}

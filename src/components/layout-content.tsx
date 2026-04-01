"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { SidebarInset, SidebarProvider } from "../components/ui/sidebar";
import { AppSidebar } from "../components/app-sidebar";
import { MobileDock } from "../components/mobile-dock";

interface LayoutContentProps {
  children: React.ReactNode;
}

// Inner component that uses useSearchParams (requires Suspense boundary)
function GlobalSearchBarInner() {
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Sync the input value from the URL whenever the ?query= param changes.
  // This handles: header navigation, browser back/forward, chip clicks on /explore.
  // Guard: skip the sync while the user is actively typing in this input.
  useEffect(() => {
    const urlQuery = searchParams.get("query") ?? "";
    if (document.activeElement !== inputRef.current) {
      setQuery(urlQuery);
    }
  }, [searchParams]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        (e.metaKey || e.ctrlKey) && e.key === "k" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  function handleChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length > 0) {
      debounceRef.current = setTimeout(() => {
        router.push(`/explore?query=${encodeURIComponent(value.trim())}`);
      }, 300);
    } else {
      debounceRef.current = setTimeout(() => {
        router.push("/explore");
      }, 300);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (trimmed) {
      router.push(`/explore?query=${encodeURIComponent(trimmed)}`);
    } else {
      router.push("/explore");
    }
  }

  return (
    // absolute positioning so the bar overlays the page content, matching riven's header behavior
    <div className="absolute top-0 left-0 right-0 z-50 hidden md:flex items-center justify-center pointer-events-none pt-4 pb-8 px-4 bg-gradient-to-b from-black/50 to-transparent">
      <form
        onSubmit={handleSubmit}
        className={`pointer-events-auto relative w-full transition-all duration-200 ${isFocused ? "max-w-xl" : "max-w-lg"}`}
      >
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50 z-10" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search movies, shows, people..."
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className="w-full h-11 pl-10 pr-14 bg-white/5 backdrop-blur-xl border border-white/5 rounded-full text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-white/10 focus:bg-black/40 focus:ring-1 focus:ring-white/20 hover:bg-white/10 transition-all duration-300"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-mono bg-white/5 border border-white/10 rounded px-1.5 py-0.5">
          ⌘K
        </div>
      </form>
    </div>
  );
}

// Suspense wrapper so useSearchParams doesn't block server rendering
function GlobalSearchBar() {
  return (
    <Suspense fallback={null}>
      <GlobalSearchBarInner />
    </Suspense>
  );
}

export function LayoutContent({ children }: LayoutContentProps) {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Cinematic viewport background — fixed, behind everything including sidebar */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-900 via-zinc-950 to-black" />
        <div className="absolute top-[-20%] left-[-10%] h-[600px] w-[600px] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute right-[-5%] bottom-[-10%] h-[500px] w-[500px] rounded-full bg-blue-500/5 blur-[100px]" />
      </div>
      <SidebarProvider
        defaultOpen={false}
        style={
          {
            "--sidebar-width": "16rem",
            "--sidebar-width-icon": "3rem",
          } as React.CSSProperties
        }
      >
        <AppSidebar />
        <SidebarInset
          className={`flex-1 overflow-hidden transition-all duration-300 ease-in-out md:pl-[var(--sidebar-width-icon)]`}
        >
          {/* relative container so the absolute search bar positions correctly */}
          <div className="relative flex-1 overflow-y-auto no-scrollbar">
            <GlobalSearchBar />
            {children}
            {/* Spacer so content isn't hidden behind the mobile dock */}
            <div className="h-20 md:hidden" />
          </div>
        </SidebarInset>
        <MobileDock />
      </SidebarProvider>
    </div>
  );
}

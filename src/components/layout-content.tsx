"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { SidebarInset, SidebarProvider } from "../components/ui/sidebar";
import { AppSidebar } from "../components/app-sidebar";

interface LayoutContentProps {
  children: React.ReactNode;
}

function GlobalSearchBar() {
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

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
    if (value.trim().length > 2) {
      debounceRef.current = setTimeout(() => {
        router.push(`/explore?query=${encodeURIComponent(value.trim())}`);
      }, 300);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/explore?query=${encodeURIComponent(query.trim())}`);
    }
  }

  return (
    <div className="absolute top-0 left-0 right-0 z-50 hidden md:flex items-center justify-center pointer-events-none pt-4 px-4">
      <form
        onSubmit={handleSubmit}
        className={`pointer-events-auto relative w-full transition-all duration-200 ${isFocused ? "max-w-xl" : "max-w-lg"}`}
      >
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search movies, shows, people..."
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className="w-full h-10 pl-10 pr-14 bg-black/40 backdrop-blur-md border border-white/10 rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/30 transition-all"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-mono bg-white/5 border border-white/10 rounded px-1.5 py-0.5">
          ⌘K
        </div>
      </form>
    </div>
  );
}

export function LayoutContent({ children }: LayoutContentProps) {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
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
          className={`flex-1 overflow-hidden transition-all duration-300 ease-in-out md:pl-[calc(var(--sidebar-width-icon)+0.5rem)]`}
        >
          <div className="relative flex-1 overflow-y-auto no-scrollbar">
            <GlobalSearchBar />
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}

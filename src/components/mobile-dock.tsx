"use client";
import { Home, Search, Library, CalendarDays, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSidebar } from "./ui/sidebar";
import { cn } from "@/src/lib/utils";

const dockItems = [
  { href: "/", icon: Home, label: "Home" },
  { href: "/explore", icon: Search, label: "Search" },
  { href: "/library", icon: Library, label: "Library" },
  { href: "/calendar", icon: CalendarDays, label: "Calendar" },
] as const;

export function MobileDock() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
      {/* Fade-out gradient above the dock */}
      <div className="pointer-events-none h-6 bg-gradient-to-t from-black/80 to-transparent" />
      <div className="flex items-center justify-around bg-black/85 backdrop-blur-xl border-t border-white/5 px-2 pb-[env(safe-area-inset-bottom)]">
        {dockItems.map(({ href, icon: Icon, label }) => {
          const isActive =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center gap-0.5 py-2.5 px-3 min-w-[3.5rem] transition-colors",
                isActive
                  ? "text-primary"
                  : "text-white/40 active:text-white/70",
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
        <button
          onClick={() => setOpenMobile(true)}
          className="flex flex-col items-center gap-0.5 py-2.5 px-3 min-w-[3.5rem] text-white/40 active:text-white/70 transition-colors"
        >
          <Menu className="h-5 w-5" />
          <span className="text-[10px] font-medium">Menu</span>
        </button>
      </div>
    </nav>
  );
}

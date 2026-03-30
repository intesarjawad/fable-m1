"use client";

import { Bell } from "lucide-react";
import { useNotifications } from "@/src/contexts/notifications-context";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/popover";
import { Button } from "./ui/button";
import { SidebarMenuButton } from "./ui/sidebar";

export function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllRead } = useNotifications();

  if (notifications.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <SidebarMenuButton tooltip="Notifications" className="relative">
          <Bell className="h-4 w-4" />
          <span>Notifications</span>
          {unreadCount > 0 && (
            <span className="absolute top-1 left-6 w-2 h-2 rounded-full bg-primary animate-pulse" />
          )}
        </SidebarMenuButton>
      </PopoverTrigger>
      <PopoverContent side="right" align="end" className="w-72 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <p className="text-sm font-medium">Notifications</p>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="text-xs h-6" onClick={markAllRead}>
              Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-64 overflow-y-auto">
          {notifications.slice(0, 20).map((notification) => (
            <div
              key={notification.id}
              className={`px-3 py-2 border-b last:border-b-0 cursor-pointer hover:bg-muted/50 transition-colors ${
                !notification.read ? "bg-muted/20" : ""
              }`}
              onClick={() => markAsRead(notification.id)}
            >
              <p className="text-sm font-medium truncate">{notification.title}</p>
              <p className="text-xs text-muted-foreground">
                {notification.type === "movie" ? "Movie" : "TV Show"} is ready
              </p>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

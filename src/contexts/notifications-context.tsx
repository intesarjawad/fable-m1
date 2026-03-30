"use client";

import { createContext, useContext, useEffect, useRef, useCallback, useState } from "react";
import type { RequestStatus } from "@/src/types/tmdb";
import { rivenStateToRequestStatus } from "@/src/lib/tmdb";
import { useRiven } from "@/src/contexts/riven-context";

interface Notification {
  id: string;
  title: string;
  type: "movie" | "show";
  tmdbId?: string;
  timestamp: string;
  read: boolean;
}

type ItemStateCallback = (data: {
  itemId: number;
  tmdbId?: string;
  tvdbId?: string;
  newState: string;
  requestStatus: RequestStatus;
}) => void;

interface NotificationsContextType {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllRead: () => void;
  onItemStateChange: (callback: ItemStateCallback) => () => void;
}

const NotificationsContext = createContext<NotificationsContextType | null>(null);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { isConnected } = useRiven();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const itemStateCallbacksRef = useRef<Set<ItemStateCallback>>(new Set());

  // Subscribe to Riven SSE streams
  useEffect(() => {
    if (!isConnected) return;

    // Uses the dedicated SSE streaming proxy (NOT the buffered JSON proxy)
    const itemUpdateSource = new EventSource("/api/riven/stream/item_update");
    const notificationsSource = new EventSource("/api/riven/stream/notifications");

    itemUpdateSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const requestStatus = rivenStateToRequestStatus(data.new_state);
        for (const callback of itemStateCallbacksRef.current) {
          callback({
            itemId: data.item_id,
            tmdbId: data.tmdb_id,
            tvdbId: data.tvdb_id,
            newState: data.new_state,
            requestStatus,
          });
        }
      } catch { /* ignore parse errors from keepalives */ }
    };

    notificationsSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const notification: Notification = {
          id: `${data.imdb_id || data.title}-${Date.now()}`,
          title: data.title,
          type: data.type,
          tmdbId: data.tmdb_id,
          timestamp: data.timestamp || new Date().toISOString(),
          read: false,
        };
        setNotifications((prev) => [notification, ...prev].slice(0, 50));
      } catch { /* ignore parse errors from keepalives */ }
    };

    return () => {
      itemUpdateSource.close();
      notificationsSource.close();
    };
  }, [isConnected]);

  const onItemStateChange = useCallback((callback: ItemStateCallback) => {
    itemStateCallbacksRef.current.add(callback);
    return () => { itemStateCallbacksRef.current.delete(callback); };
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationsContext.Provider
      value={{ notifications, unreadCount, markAsRead, markAllRead, onItemStateChange }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) throw new Error("useNotifications must be used within NotificationsProvider");
  return context;
}

"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
} from "react";

interface RivenContextType {
  isConnected: boolean;
  isLoading: boolean;
  connectionError: string | null;
}

const RivenContext = createContext<RivenContextType | undefined>(undefined);

export function RivenProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkConnection() {
      try {
        const response = await fetch("/api/riven/health");
        if (cancelled) return;

        if (response.ok) {
          setIsConnected(true);
          setConnectionError(null);
        } else if (response.status === 503) {
          // Not configured
          setIsConnected(false);
          setConnectionError(null);
        } else {
          setIsConnected(false);
          const data = await response.json().catch(() => null);
          setConnectionError(data?.message || `Status ${response.status}`);
        }
      } catch (error) {
        if (cancelled) return;
        setIsConnected(false);
        setConnectionError(
          error instanceof Error ? error.message : "Connection check failed",
        );
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    checkConnection();

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({ isConnected, isLoading, connectionError }),
    [isConnected, isLoading, connectionError],
  );

  return (
    <RivenContext.Provider value={value}>{children}</RivenContext.Provider>
  );
}

export function useRiven() {
  const context = useContext(RivenContext);
  if (context === undefined) {
    throw new Error("useRiven must be used within a RivenProvider");
  }
  return context;
}

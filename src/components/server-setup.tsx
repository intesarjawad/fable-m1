"use client";
import React, { useEffect, useState } from "react";
import {
  CardDescription,
  CardTitle,
} from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { checkServerHealth, setServerUrl } from "../actions";
import { Loader2, Server, CheckCircle, Globe, Shield } from "lucide-react";
import axios from "axios";

interface ServerSetupProps {
  onNext: () => void;
}

type ConnectionStatus =
  | "idle"
  | "connecting"
  | "trying-http"
  | "trying-https"
  | "success"
  | "error";

export function ServerSetup({ onNext }: ServerSetupProps) {
  const [url, setUrl] = useState("");
  const [urlLoading, setUrlLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("idle");
  const [error, setError] = useState("");
  const [detectedUrl, setDetectedUrl] = useState("");

  useEffect(() => {
    async function fetchConfig() {
      try {
        const { data } = await axios("/api/config");
        if (data.defaultServerUrl) setUrl(data.defaultServerUrl);
      } catch (err) {
        console.error("Failed to fetch runtime config", err);
      } finally {
        setUrlLoading(false);
      }
    }
    fetchConfig();
  }, []);

  const isLoading =
    connectionStatus !== "idle" &&
    connectionStatus !== "success" &&
    connectionStatus !== "error";

  const cleanUrl = (inputUrl: string): string => {
    let cleaned = inputUrl.trim();
    // Remove trailing slash
    cleaned = cleaned.replace(/\/$/, "");
    return cleaned;
  };

  const getConnectionMessage = (): string => {
    switch (connectionStatus) {
      case "connecting":
        return "Connecting to server...";
      case "trying-http":
        return "Trying HTTP connection...";
      case "trying-https":
        return "Trying HTTPS connection...";
      case "success":
        return "Connected successfully!";
      default:
        return "Connect to Server";
    }
  };

  const getConnectionIcon = () => {
    switch (connectionStatus) {
      case "trying-http":
        return <Globe className="h-4 w-4 animate-pulse" />;
      case "trying-https":
        return <Shield className="h-4 w-4 animate-pulse" />;
      case "success":
        return <CheckCircle className="h-4 w-4" />;
      default:
        return isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      setError("Please enter a server URL");
      return;
    }

    setConnectionStatus("connecting");
    setError("");
    setDetectedUrl("");

    console.log("URL:", url);

    try {
      const cleanedUrl = cleanUrl(url);
      console.log("Cleaned URL:", cleanedUrl);
      const result = await checkServerHealth(cleanedUrl);
      console.log("Health check result:", result);
      if (result.success && result.finalUrl) {
        setConnectionStatus("success");
        setDetectedUrl(result.finalUrl);
        await setServerUrl(result.finalUrl);
        console.log("Server URL set to:", result.finalUrl);
        // Small delay to show success state
        setTimeout(() => {
          onNext();
        }, 800);
      } else {
        console.log("Health check failed:", result.error);
        setConnectionStatus("error");
        setError(
          result.error ||
            "Unable to connect to Jellyfin server. Please check the URL and try again.",
        );
      }
    } catch {
      console.error("Unexpected error during server connection");
      setConnectionStatus("error");
      setError("An unexpected error occurred. Please try again.");
    }
  };

  if (urlLoading) return;

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-black p-4 w-full">
      {/* Dark Matter ambient glow */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-900 via-zinc-950 to-black" />
        <div className="absolute top-[-15%] left-[20%] h-[500px] w-[500px] rounded-full bg-orange-500/8 blur-[140px]" />
        <div className="absolute bottom-[-10%] right-[10%] h-[400px] w-[400px] rounded-full bg-amber-600/6 blur-[120px]" />
        <div className="absolute top-[40%] left-[-5%] h-[300px] w-[300px] rounded-full bg-orange-800/5 blur-[100px]" />
      </div>

      {/* Grain overlay */}
      <div
        className="pointer-events-none fixed inset-0 z-10 opacity-[0.025]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      <div className="relative z-20 flex w-full max-w-md flex-col items-center px-6">
        {/* Branding */}
        <div className="mb-10 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-card/80 backdrop-blur-sm border border-border shadow-lg shadow-black/20">
            <Server className="h-6 w-6 text-primary" />
          </div>
          <div className="text-center">
            <CardTitle className="text-2xl">Connect to Jellyfin</CardTitle>
            <CardDescription className="mt-1">
              Enter your Jellyfin server URL to get started
            </CardDescription>
          </div>
        </div>

        {/* Glass card */}
        <div
          className="w-full rounded-2xl border border-border/60 p-6 backdrop-blur-xl"
          style={{
            background: "color-mix(in oklch, var(--card) 60%, transparent)",
            boxShadow: "0 16px 48px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.04)",
          }}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="server-url"
                className="block text-xs font-medium text-muted-foreground uppercase tracking-wider"
              >
                Server URL
              </label>
              <Input
                id="server-url"
                type="text"
                placeholder="jellyfin.example.com or 192.168.1.100:8096"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={isLoading}
                className={`h-11 rounded-xl border-border/60 bg-muted/30 text-foreground placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-primary/20 ${
                  error
                    ? "border-destructive"
                    : connectionStatus === "success"
                      ? "border-green-500"
                      : ""
                }`}
              />

              {/* Connection Status */}
              {(connectionStatus === "connecting" ||
                connectionStatus === "trying-http" ||
                connectionStatus === "trying-https") && (
                <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                  {getConnectionIcon()}
                  <span>{getConnectionMessage()}</span>
                </div>
              )}

              {/* Success State */}
              {connectionStatus === "success" && detectedUrl && (
                <div className="flex items-center gap-2 mt-2 text-sm text-green-500">
                  <CheckCircle className="h-4 w-4" />
                  <span>Connected to {detectedUrl}</span>
                </div>
              )}

              {/* Error State */}
              {error && (
                <div className="flex items-center gap-2 mt-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive-foreground">
                  <span>{error}</span>
                </div>
              )}

              {/* Help Text */}
              <div className="mt-3 space-y-1">
                <p className="text-xs text-muted-foreground">
                  No need to include http:// or https:// - we&apos;ll try HTTPS
                  first, then HTTP
                </p>
                <p className="text-xs text-muted-foreground">
                  Examples:{" "}
                  <code className="text-xs bg-muted/50 px-1.5 py-0.5 rounded-md">
                    jellyfin.mydomain.com
                  </code>
                  ,{" "}
                  <code className="text-xs bg-muted/50 px-1.5 py-0.5 rounded-md">
                    192.168.1.100:8096
                  </code>
                </p>
              </div>
            </div>

            <Button
              type="submit"
              className={`h-11 w-full rounded-xl font-semibold ${
                connectionStatus === "success"
                  ? "bg-green-600 hover:bg-green-700"
                  : ""
              }`}
              disabled={isLoading}
            >
              <span className="flex items-center gap-2">
                {getConnectionIcon()}
                <span>{getConnectionMessage()}</span>
              </span>
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  Key,
  Loader2,
  Save,
  Unplug,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/src/components/ui/collapsible";
import { Label } from "@/src/components/ui/label";
import { Input } from "@/src/components/ui/input";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/lib/utils";
import { toast } from "sonner";
import {
  setTmdbConfig,
  getTmdbConfig,
  removeTmdbConfig,
} from "@/src/actions/store/server-actions";
import { getUser } from "@/src/actions";

async function testTmdbApiKey(apiKeyToTest: string): Promise<boolean> {
  try {
    // Temporarily save the key so the proxy can use it, then test via the proxy.
    // We test directly against TMDB from the browser instead, passing the key in the URL.
    const response = await fetch(
      `https://api.themoviedb.org/3/configuration?api_key=${encodeURIComponent(apiKeyToTest)}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!response.ok) return false;
    const data = await response.json();
    return typeof data?.images === "object";
  } catch {
    return false;
  }
}

export default function TmdbSection() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasEnvConfig, setHasEnvConfig] = useState(false);

  const [apiKey, setApiKey] = useState("");

  const loadState = useCallback(async () => {
    try {
      const [user, savedConfig, envResponse] = await Promise.all([
        getUser(),
        getTmdbConfig(),
        fetch("/api/config/tmdb").then((r) => r.json()),
      ]);

      const admin = Boolean((user as any)?.Policy?.IsAdministrator);
      setIsAdmin(admin);

      if (!admin) return;

      setHasEnvConfig(envResponse.hasEnvConfig || false);

      if (savedConfig?.apiKey) {
        const keyWorks = await testTmdbApiKey(savedConfig.apiKey);
        setIsConnected(keyWorks);
      } else if (envResponse.hasEnvConfig) {
        // Env key is configured — test via the proxy (which will pick it up)
        try {
          const proxyResponse = await fetch("/api/tmdb/configuration");
          if (proxyResponse.ok) {
            const data = await proxyResponse.json();
            setIsConnected(typeof data?.images === "object");
          }
        } catch {
          setIsConnected(false);
        }
      }
    } catch (error) {
      console.error("Failed to load TMDB settings:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  if (!isAdmin) return null;

  const handleTestAndSave = async () => {
    if (!apiKey) {
      toast.error("Enter a TMDB API key");
      return;
    }

    setIsTesting(true);
    const toastId = toast.loading("Testing connection...");

    try {
      const keyWorks = await testTmdbApiKey(apiKey);

      if (keyWorks) {
        await setTmdbConfig({ apiKey });
        setIsConnected(true);
        toast.success("Connected to TMDB", { id: toastId });
      } else {
        setIsConnected(false);
        toast.error("Invalid API key — TMDB rejected it", { id: toastId });
      }
    } catch {
      toast.error("Unexpected error", { id: toastId });
    } finally {
      setIsTesting(false);
    }
  };

  const handleDisconnect = async () => {
    await removeTmdbConfig();
    setApiKey("");
    setIsConnected(false);
    toast.success("TMDB configuration cleared");

    // If an env key exists, check whether it still connects
    if (hasEnvConfig) {
      try {
        const proxyResponse = await fetch("/api/tmdb/configuration");
        if (proxyResponse.ok) {
          const data = await proxyResponse.json();
          setIsConnected(typeof data?.images === "object");
        }
      } catch {
        // env key doesn't connect either — leave disconnected
      }
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="bg-card/80 backdrop-blur">
        <CollapsibleTrigger asChild>
          <CardHeader className="flex flex-wrap items-start justify-between gap-3 cursor-pointer">
            <CardTitle className="flex items-center gap-2 font-poppins text-lg">
              <Key className="h-5 w-5" />
              TMDB
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {!isLoading && isConnected && (
                <div className="flex items-center gap-1.5 rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-medium text-green-500 ring-1 ring-inset ring-green-500/20">
                  <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                  Connected
                </div>
              )}
            </CardTitle>
            <button
              type="button"
              aria-expanded={isOpen}
              className="inline-flex items-center gap-1 rounded-full border border-border/60 px-3 py-1 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
            >
              {isOpen ? "Hide" : "Show"}
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform duration-200",
                  isOpen ? "rotate-180" : "rotate-0",
                )}
              />
            </button>
            <CardDescription className="w-full">
              Connect to The Movie Database for content discovery.
            </CardDescription>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-up data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-down">
          <CardContent className="space-y-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-4 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading settings...
              </div>
            ) : isConnected ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10">
                      <Key className="h-5 w-5 text-green-500" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-medium text-foreground">
                        Connected to TMDB
                      </h4>
                      {hasEnvConfig && (
                        <p className="text-xs text-muted-foreground/60 mt-0.5">
                          Configured via environment
                        </p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={handleDisconnect}
                    >
                      <Unplug className="h-3.5 w-3.5 mr-1" />
                      Disconnect
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {hasEnvConfig && (
                  <p className="text-xs text-muted-foreground">
                    Environment variable detected. Enter a value below to
                    override.
                  </p>
                )}

                <div className="space-y-2">
                  <Label htmlFor="tmdb-key">API Key</Label>
                  <div className="relative">
                    <Key className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="tmdb-key"
                      type="password"
                      placeholder="Your TMDB API key"
                      className="pl-9 bg-background/50"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    size="sm"
                    className="w-full gap-2 sm:w-auto"
                    onClick={handleTestAndSave}
                    disabled={isTesting}
                  >
                    {isTesting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Test & Save
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

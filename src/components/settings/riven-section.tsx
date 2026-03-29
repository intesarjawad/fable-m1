"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  Key,
  Loader2,
  Save,
  Server,
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
  testRivenConnection,
  saveRivenConfig,
  disconnectRiven,
  resolveRivenConfig,
} from "@/src/actions/riven";
import { getUser } from "@/src/actions";

export default function RivenSection() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasEnvConfig, setHasEnvConfig] = useState(false);
  const [envApiUrl, setEnvApiUrl] = useState<string | null>(null);

  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");

  const loadState = useCallback(async () => {
    try {
      const [user, config, envResponse] = await Promise.all([
        getUser(),
        resolveRivenConfig(),
        fetch("/api/config/riven").then((r) => r.json()),
      ]);

      const admin = Boolean((user as any)?.Policy?.IsAdministrator);
      setIsAdmin(admin);

      if (!admin) return;

      setHasEnvConfig(envResponse.hasEnvConfig || false);
      setEnvApiUrl(envResponse.envApiUrl || null);

      if (config) {
        setApiUrl(config.apiUrl);
        const result = await testRivenConnection(config);
        setIsConnected(result.success);
      }
    } catch (error) {
      console.error("Failed to load Riven settings:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  if (!isAdmin) return null;

  const handleTestAndSave = async () => {
    if (!apiUrl) {
      toast.error("Enter a Riven API URL");
      return;
    }
    if (!apiKey) {
      toast.error("Enter a Riven API key");
      return;
    }

    setIsTesting(true);
    const toastId = toast.loading("Testing connection...");

    try {
      const config = { apiUrl, apiKey };
      const result = await testRivenConnection(config);

      if (result.success) {
        await saveRivenConfig(config);
        setIsConnected(true);
        toast.success("Connected to Riven", { id: toastId });
      } else {
        setIsConnected(false);
        toast.error(result.message || "Connection failed", { id: toastId });
      }
    } catch {
      toast.error("Unexpected error", { id: toastId });
    } finally {
      setIsTesting(false);
    }
  };

  const handleDisconnect = async () => {
    await disconnectRiven();
    setApiUrl(envApiUrl || "");
    setApiKey("");
    setIsConnected(false);
    toast.success("Riven configuration cleared");

    // Re-check if ENV config still connects
    if (hasEnvConfig) {
      const result = await testRivenConnection();
      setIsConnected(result.success);
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="bg-card/80 backdrop-blur">
        <CollapsibleTrigger asChild>
          <CardHeader className="flex flex-wrap items-start justify-between gap-3 cursor-pointer">
            <CardTitle className="flex items-center gap-2 font-poppins text-lg">
              <Server className="h-5 w-5" />
              Riven
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
              Connect to your Riven instance for media library management.
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
                      <Server className="h-5 w-5 text-green-500" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-medium text-foreground">
                        Connected to Riven
                      </h4>
                      <p className="text-xs text-muted-foreground break-all">
                        {apiUrl}
                      </p>
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
                    Environment variables detected ({envApiUrl}). Enter values
                    below to override.
                  </p>
                )}

                <div className="space-y-2">
                  <Label htmlFor="riven-url">API URL</Label>
                  <div className="relative">
                    <Server className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="riven-url"
                      placeholder={envApiUrl || "http://riven:8080"}
                      className="pl-9 bg-background/50"
                      value={apiUrl}
                      onChange={(e) => setApiUrl(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="riven-key">API Key</Label>
                  <div className="relative">
                    <Key className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="riven-key"
                      type="password"
                      placeholder="Your Riven API key"
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

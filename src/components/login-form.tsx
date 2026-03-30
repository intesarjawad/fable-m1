"use client";
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  FormEvent,
} from "react";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { VibrantAuroraBackground } from "../components/vibrant-aurora-background";
import {
  authenticateUser,
  isQuickConnectEnabled,
  initiateQuickConnect,
  getQuickConnectStatus,
  authenticateWithQuickConnect,
  getServerUrl,
} from "../actions";
import {
  Loader2,
  ArrowLeft,
  RefreshCcw,
  AlertCircle,
  ShieldCheck,
  Play,
  Lock,
  Zap,
} from "lucide-react";
import { StoreLoginPreferences } from "../actions/store/store-login-preferences";

interface LoginFormProps {
  onSuccess: () => void;
  onBack: () => void;
}

type AuthMethod = "password" | "quickconnect";

interface QuickConnectSession {
  code: string;
  secret: string;
}

export function LoginForm({ onSuccess, onBack }: LoginFormProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [serverName, setServerName] = useState("Fable");

  const [authMethod, setAuthMethod] = useState<AuthMethod>("password");
  const [quickConnectSupported, setQuickConnectSupported] = useState<
    boolean | null
  >(null);
  const [quickConnectSession, setQuickConnectSession] =
    useState<QuickConnectSession | null>(null);
  const [quickConnectError, setQuickConnectError] = useState<string | null>(
    null,
  );
  const [quickConnectLoading, setQuickConnectLoading] = useState(false);

  const pollTimerRef = useRef<number | null>(null);
  const lastSecretRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);

  const stopQuickConnectPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    (async () => {
      const prefs = await StoreLoginPreferences.get();
      if (!isMountedRef.current) return;
      if (prefs?.username) {
        setUsername(prefs.username);
      }
    })();

    // Get server name from URL
    (async () => {
      const url = await getServerUrl();
      if (url && isMountedRef.current) {
        try {
          const hostname = new URL(url).hostname;
          const name = hostname.split(".")[0];
          if (name && name !== "jellyfin" && name !== "www") {
            setServerName(name.charAt(0).toUpperCase() + name.slice(1));
          }
        } catch {}
      }
    })();

    return () => {
      isMountedRef.current = false;
      stopQuickConnectPolling();
    };
  }, [stopQuickConnectPolling]);

  useEffect(() => {
    let active = true;
    isQuickConnectEnabled()
      .then((enabled) => {
        if (!active) return;
        setQuickConnectSupported(enabled);
      })
      .catch(() => {
        if (active) setQuickConnectSupported(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (quickConnectSupported === false && authMethod === "quickconnect") {
      setAuthMethod("password");
    }
  }, [authMethod, quickConnectSupported]);

  const pollQuickConnectStatus = useCallback(async () => {
    const secret = lastSecretRef.current;
    if (!secret) return;

    try {
      const status = await getQuickConnectStatus(secret);
      if (!status) return;

      const nextSecret = status.Secret || secret;
      lastSecretRef.current = nextSecret;

      if (status.Code) {
        setQuickConnectSession({ code: status.Code, secret: nextSecret });
      } else {
        setQuickConnectSession((prev) =>
          prev ? { ...prev, secret: nextSecret } : prev,
        );
      }

      if (status.Authenticated) {
        stopQuickConnectPolling();
        const success = await authenticateWithQuickConnect(nextSecret);
        if (!isMountedRef.current) return;
        if (success) {
          onSuccess();
          return;
        }
        setQuickConnectError("Quick Connect approved but sign-in failed. Try again or use your password.");
      }
    } catch (err) {
      stopQuickConnectPolling();
      if (!isMountedRef.current) return;
      setQuickConnectError(
        err instanceof Error ? err.message : "Could not check Quick Connect status.",
      );
    }
  }, [onSuccess, stopQuickConnectPolling]);

  const startQuickConnect = useCallback(async () => {
    if (quickConnectLoading) return;
    setQuickConnectLoading(true);
    setQuickConnectError(null);
    setQuickConnectSession(null);
    stopQuickConnectPolling();
    lastSecretRef.current = null;

    try {
      const session = await initiateQuickConnect();
      if (!isMountedRef.current) return;
      if (!session?.Secret || !session?.Code) {
        throw new Error("Quick Connect did not return a valid code.");
      }
      setQuickConnectSession({ code: session.Code, secret: session.Secret });
      lastSecretRef.current = session.Secret;
      await pollQuickConnectStatus();
      pollTimerRef.current = window.setInterval(() => {
        void pollQuickConnectStatus();
      }, 4000);
    } catch (err) {
      if (!isMountedRef.current) return;
      setQuickConnectError(
        err instanceof Error ? err.message : "Unable to start Quick Connect.",
      );
      setQuickConnectSession(null);
      stopQuickConnectPolling();
    } finally {
      if (isMountedRef.current) setQuickConnectLoading(false);
    }
  }, [pollQuickConnectStatus, quickConnectLoading, stopQuickConnectPolling]);

  useEffect(() => {
    if (authMethod !== "quickconnect") {
      stopQuickConnectPolling();
      return;
    }
    if (quickConnectSupported !== true) return;
    if (quickConnectSession || quickConnectLoading) return;
    startQuickConnect().catch(() => {});
  }, [authMethod, quickConnectSupported, quickConnectSession, quickConnectLoading, startQuickConnect, stopQuickConnectPolling]);

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!username.trim()) {
      setError("Please enter a username");
      return;
    }
    setIsLoading(true);
    setError("");
    try {
      const success = await authenticateUser(username, password);
      if (success) onSuccess();
      else setError("Invalid username or password");
    } catch {
      setError("Authentication failed");
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  };

  const quickConnectAvailable = quickConnectSupported === true;
  const formattedCode = quickConnectSession?.code
    ? quickConnectSession.code.replace(/(.{3})/g, "$1 ").trim()
    : "------";

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#050508]">
      <VibrantAuroraBackground amplitude={0.6} blend={0.3} />

      {/* Grain overlay */}
      <div
        className="pointer-events-none fixed inset-0 z-10 opacity-[0.025]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      <div className="relative z-20 flex w-full max-w-sm flex-col items-center px-6">
        {/* Branding */}
        <div className="mb-10 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 backdrop-blur-sm border border-white/[0.06] shadow-lg shadow-black/20">
            <Play className="h-6 w-6 text-white/80 fill-white/80" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-white/90">
              {serverName}
            </h1>
            <p className="mt-1 text-sm text-white/35">
              Sign in to start watching
            </p>
          </div>
        </div>

        {/* Glass card */}
        <div
          className="w-full rounded-2xl border border-white/[0.06] p-6 backdrop-blur-xl"
          style={{
            background: "rgba(255, 255, 255, 0.02)",
            boxShadow: "0 16px 48px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.04)",
          }}
        >
          {/* Auth method toggle */}
          {quickConnectAvailable && (
            <div className="mb-6 flex rounded-xl bg-white/[0.03] border border-white/[0.06] p-1">
              <button
                onClick={() => setAuthMethod("password")}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium transition-all duration-200 ${
                  authMethod === "password"
                    ? "bg-white/[0.08] text-white shadow-sm"
                    : "text-white/40 hover:text-white/60"
                }`}
              >
                <Lock className="h-3 w-3" />
                Password
              </button>
              <button
                onClick={() => setAuthMethod("quickconnect")}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium transition-all duration-200 ${
                  authMethod === "quickconnect"
                    ? "bg-white/[0.08] text-white shadow-sm"
                    : "text-white/40 hover:text-white/60"
                }`}
              >
                <Zap className="h-3 w-3" />
                Quick Connect
              </button>
            </div>
          )}

          {authMethod === "password" ? (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="username"
                  className="block text-xs font-medium text-white/50 uppercase tracking-wider"
                >
                  Username
                </label>
                <Input
                  id="username"
                  type="text"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isLoading}
                  autoComplete="username"
                  className="h-11 rounded-xl border-white/[0.06] bg-white/[0.03] text-white placeholder:text-white/20 focus:border-white/15 focus:ring-white/10"
                />
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="password"
                  className="block text-xs font-medium text-white/50 uppercase tracking-wider"
                >
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  autoComplete="current-password"
                  className="h-11 rounded-xl border-white/[0.06] bg-white/[0.03] text-white placeholder:text-white/20 focus:border-white/15 focus:ring-white/10"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                type="submit"
                disabled={isLoading}
                className="h-11 w-full rounded-xl bg-white/90 text-black font-semibold hover:bg-white transition-colors"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>
            </form>
          ) : (
            <div className="space-y-4">
              {quickConnectError && (
                <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{quickConnectError}</span>
                </div>
              )}

              {!quickConnectError && !quickConnectSession && quickConnectLoading && (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-white/40">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating code...
                </div>
              )}

              {quickConnectSession && (
                <div className="space-y-5 text-center">
                  <div className="flex items-center justify-center gap-2 text-xs text-white/40">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Approve from any signed-in device
                  </div>
                  <div
                    className="mx-auto w-fit rounded-xl border border-white/[0.08] bg-white/[0.03] px-8 py-4 font-mono text-3xl font-bold tracking-[0.5em] text-white"
                    style={{
                      boxShadow: "0 0 40px rgba(255, 255, 255, 0.03)",
                    }}
                  >
                    {formattedCode}
                  </div>
                  <p className="text-xs leading-relaxed text-white/30">
                    Open Jellyfin on a signed-in device, go to{" "}
                    <span className="text-white/50 font-medium">Quick Connect</span>, and enter the code above.
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => startQuickConnect().catch(() => {})}
                    disabled={quickConnectLoading}
                    className="text-xs text-white/40 hover:text-white/60"
                  >
                    <RefreshCcw className="mr-1.5 h-3 w-3" />
                    New code
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="mt-8 text-[11px] text-white/15">
          Powered by Jellyfin
        </p>
      </div>
    </div>
  );
}

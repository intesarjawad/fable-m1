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
import {
  authenticateUser,
  isQuickConnectEnabled,
  initiateQuickConnect,
  getQuickConnectStatus,
  authenticateWithQuickConnect,
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

    // Fetch actual server name from Jellyfin API
    (async () => {
      const { getPublicServerInfo } = await import("../actions");
      const info = await getPublicServerInfo();
      if (info?.ServerName && isMountedRef.current) {
        setServerName(info.ServerName);
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
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
      <div className="flex w-full max-w-sm flex-col items-center">
        {/* Branding */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
            <Play className="h-5 w-5 fill-primary-foreground text-primary-foreground" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {serverName}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign in to start watching
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="w-full rounded-lg border border-border bg-card p-6">
          {/* Auth method toggle */}
          {quickConnectAvailable && (
            <div className="mb-6 flex rounded-lg bg-muted p-1">
              <button
                onClick={() => setAuthMethod("password")}
                className={`flex-1 flex items-center justify-center gap-2 rounded-md py-2 text-xs font-medium transition-colors ${
                  authMethod === "password"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Lock className="h-3 w-3" />
                Password
              </button>
              <button
                onClick={() => setAuthMethod("quickconnect")}
                className={`flex-1 flex items-center justify-center gap-2 rounded-md py-2 text-xs font-medium transition-colors ${
                  authMethod === "quickconnect"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
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
                  className="block text-sm font-medium text-foreground"
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
                />
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-foreground"
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
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                type="submit"
                disabled={isLoading}
                className="mt-2 h-10 w-full"
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
                <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{quickConnectError}</span>
                </div>
              )}

              {!quickConnectError && !quickConnectSession && quickConnectLoading && (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating code...
                </div>
              )}

              {quickConnectSession && (
                <div className="space-y-5 text-center">
                  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Approve from any signed-in device
                  </div>
                  <div className="mx-auto w-fit rounded-lg border border-border bg-muted px-8 py-4 font-mono text-3xl font-bold tracking-[0.5em] text-foreground">
                    {formattedCode}
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Open Jellyfin on a signed-in device, go to{" "}
                    <span className="text-foreground font-medium">Quick Connect</span>, and enter the code above.
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => startQuickConnect().catch(() => {})}
                    disabled={quickConnectLoading}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    <RefreshCcw className="mr-1.5 h-3 w-3" />
                    New code
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Back link */}
        <button
          onClick={onBack}
          className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3 w-3" />
          Change server
        </button>
      </div>
    </div>
  );
}

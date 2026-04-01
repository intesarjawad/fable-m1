"use client";
import React, { useState, useEffect } from "react";
import { isAuthenticated, getServerUrl, checkServerHealth, setServerUrl as saveServerUrl } from "../actions";
import { ServerSetup } from "../components/server-setup";
import { LoginForm } from "../components/login-form";
import { ThemePreferenceStep } from "./theme-preference-step";
import { useAtom } from "jotai";
import { themeSelectionAtom } from "../lib/atoms";
import { useRouter } from "next/navigation";

type OnboardingStep = "server" | "login" | "theme" | "loading";

export function OnboardingFlow() {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>("loading");
  const router = useRouter();
  const [selectedTheme] = useAtom(themeSelectionAtom);

  useEffect(() => {
    const checkAuthStatus = async () => {
      const authenticated = await isAuthenticated();
      const serverUrl = await getServerUrl();

      if (authenticated && serverUrl) {
        router.push("/");
        return;
      }

      if (serverUrl) {
        setCurrentStep("login");
        return;
      }

      // Check if DEFAULT_SERVER_URL is configured
      try {
        const configRes = await fetch("/api/config");
        const config = await configRes.json();
        if (config.defaultServerUrl) {
          const health = await checkServerHealth(config.defaultServerUrl);
          if (health.success) {
            await saveServerUrl(health.finalUrl || config.defaultServerUrl);
            setCurrentStep("login");
            return;
          }
        }
      } catch {
        // Ignore config fetch failures
      }

      setCurrentStep("server");
    };

    checkAuthStatus();
  }, [router]);

  const handleServerSetup = () => {
    setCurrentStep("login");
  };

  const handleLoginSuccess = () => {
    router.push("/");
  };

  const handleThemeComplete = () => {
    router.push("/");
  };

  const handleBackToServer = () => {
    setCurrentStep("server");
  };

  if (currentStep === "loading") {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-[#050508]" />
    );
  }

  if (currentStep === "server") {
    return <ServerSetup onNext={handleServerSetup} />;
  }

  if (currentStep === "login") {
    return (
      <LoginForm onSuccess={handleLoginSuccess} onBack={handleBackToServer} />
    );
  }

  if (currentStep === "theme") {
    return (
      <ThemePreferenceStep
        onComplete={handleThemeComplete}
        onBack={() => setCurrentStep("login")}
      />
    );
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[#050508]" />
  );
}

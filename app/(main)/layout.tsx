"use client";
import { JotaiProvider } from "@/src/components/jotai-provider";
import { FullscreenDetector } from "@/src/components/fullscreen-detector";
import { LayoutContent } from "@/src/components/layout-content";
import { useAuth } from "@/src/hooks/useAuth";
import { PlaybackProvider } from "@/src/playback/context/PlaybackProvider";
import { AuthErrorHandler } from "@/src/components/auth-error-handler";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  return (
    <JotaiProvider>
      <PlaybackProvider>
        <FullscreenDetector />
        <AuthErrorHandler>
          <LayoutContent>{children}</LayoutContent>
        </AuthErrorHandler>
      </PlaybackProvider>
    </JotaiProvider>
  );
}

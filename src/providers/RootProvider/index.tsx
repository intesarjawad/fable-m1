import { AuthProvider } from "../../contexts/AuthContext";
import { SettingsProvider } from "../../contexts/settings-context";
import { Toaster } from "sonner";
import { ThemeProvider } from "next-themes";

export default function RootProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      forcedTheme="dark"
      disableTransitionOnChange
    >
      <Toaster />
      <AuthProvider>
        <SettingsProvider>{children}</SettingsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

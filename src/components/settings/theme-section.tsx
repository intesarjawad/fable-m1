"use client";
import { useSettings } from "../../contexts/settings-context";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Moon } from "lucide-react";

export default function ThemeSection() {
  const {
    enableThemeBackdrops,
    setEnableThemeBackdrops,
    enableThemeSongs,
    setEnableThemeSongs,
  } = useSettings();

  return (
    <Card className="bg-card/80 backdrop-blur">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-poppins text-lg">
          <Moon className="h-5 w-5" />
          Appearance
        </CardTitle>
        <CardDescription>
          Fable uses dark mode. Adjust playback experience options below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Theme backdrops</p>
            <p className="text-xs text-muted-foreground">
              Show animated backdrop images on media pages
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEnableThemeBackdrops(!enableThemeBackdrops)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-primary/40 ${
              enableThemeBackdrops ? "bg-primary" : "bg-muted"
            }`}
            aria-pressed={enableThemeBackdrops}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                enableThemeBackdrops ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Theme songs</p>
            <p className="text-xs text-muted-foreground">
              Play theme music on media detail pages
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEnableThemeSongs(!enableThemeSongs)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-primary/40 ${
              enableThemeSongs ? "bg-primary" : "bg-muted"
            }`}
            aria-pressed={enableThemeSongs}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                enableThemeSongs ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

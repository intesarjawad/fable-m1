import { Settings2 } from "lucide-react";
import SeerrSection from "@/src/components/settings/seerr-section";
import TmdbSection from "@/src/components/settings/tmdb-section";
import ProfileSection from "@/src/components/settings/profile-section";
import ThemeSection from "@/src/components/settings/theme-section";
import UserPreferenceSection from "@/src/components/settings/user-preference-section";

export default function SettingsPage() {
  return (
    <div className="relative px-4 pt-20 pb-3 max-w-full overflow-hidden">
      <div className="relative z-10">
        <div className="mb-8">
          <h2 className="text-3xl font-semibold text-foreground mb-2 font-poppins flex items-center gap-2">
            <Settings2 className="h-8 w-8" />
            Settings
          </h2>
          <p className="text-muted-foreground">
            Customize the interface and preview upcoming dashboard themes.
          </p>
        </div>

        <div className="grid gap-6">
          <ProfileSection />
          <SeerrSection />
          <TmdbSection />
          <UserPreferenceSection />
          <ThemeSection />
        </div>
      </div>
    </div>
  );
}

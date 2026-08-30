import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Monitor, Moon, SlidersHorizontal, Sun } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AccountSettings } from "@/client/features/settings/AccountSettings";
import { ApiKeySettings } from "@/client/features/settings/ApiKeySettings";
import { CurrencySettings } from "@/client/features/business-modules/CurrencySettings";
import { TeamSettings } from "@/client/features/settings/TeamSettings";
import { type ThemePreference, useThemePreference } from "@/client/lib/theme";
import { authClient, useSession } from "@/lib/auth-client";
import { isUserClientAuthMode } from "@/lib/auth-mode";
import { version } from "../../../package.json";
import { getBusinessModuleAccess } from "@/serverFunctions/business-modules";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

const THEME_OPTIONS: {
  value: ThemePreference;
  label: string;
  icon: typeof Sun;
}[] = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

function SettingsPage() {
  const hasUserAccounts = isUserClientAuthMode();
  const { themePreference, setThemePreference } = useThemePreference();
  const { data: session, isPending: isSessionPending } = useSession();
  const [isSaving, setIsSaving] = useState(false);

  const analyticsEnabled = session?.user?.analyticsOptedOut !== true;
  const businessAccess = useQuery({
    queryKey: ["business-modules", "settings-access"],
    queryFn: () => getBusinessModuleAccess(),
    enabled: hasUserAccounts,
  });
  const canManageBusinessAccess =
    businessAccess.data?.some((item) => item.canConfigureEntitlement) ?? false;

  async function updateAnalyticsPreference(enabled: boolean) {
    setIsSaving(true);
    try {
      const result = await authClient.updateUser({
        analyticsOptedOut: !enabled,
      });
      if (result.error) {
        toast.error("We couldn't update your analytics setting.");
      } else {
        toast.success(enabled ? "Analytics enabled" : "Analytics disabled");
      }
    } catch {
      toast.error("We couldn't update your analytics setting.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="h-full overflow-auto bg-base-100 px-4 py-6 pb-24 md:px-6 md:py-7 md:pb-8">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-base leading-6 text-base-content/65">
            Manage your account, team, access, and product preferences.
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-base-content/50">
            Appearance
          </h2>
          <div className="flex items-center justify-between gap-6">
            <span className="text-sm">Theme</span>
            <div
              role="radiogroup"
              aria-label="Theme preference"
              className="flex gap-0.5 rounded-lg bg-base-200 p-0.5"
            >
              {THEME_OPTIONS.map((option) => {
                const isActive = option.value === themePreference;
                const Icon = option.icon;

                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    aria-label={option.label}
                    className={`flex cursor-pointer items-center justify-center rounded-md px-3 py-1.5 transition-colors ${
                      isActive
                        ? "bg-base-100 text-base-content shadow-sm"
                        : "text-base-content/50 hover:text-base-content/80"
                    }`}
                    onClick={() => setThemePreference(option.value)}
                  >
                    <Icon className="size-4" />
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {hasUserAccounts ? (
          <>
            <AccountSettings />

            <TeamSettings />

            {canManageBusinessAccess ? (
              <section className="space-y-3">
                <h2 className="flex items-center gap-2 text-sm font-medium text-base-content/50">
                  <SlidersHorizontal className="size-4" /> Business Access
                </h2>
                <div className="flex items-center justify-between gap-6 rounded-lg border border-base-300 p-4">
                  <div>
                    <p className="text-sm font-medium">
                      Capabilities and permissions
                    </p>
                    <p className="mt-1 text-sm text-base-content/60">
                      Choose what this organization and each staff member can
                      use.
                    </p>
                  </div>
                  <Link to="/modules" className="btn btn-outline btn-sm">
                    Manage
                  </Link>
                </div>
              </section>
            ) : null}

            <CurrencySettings />

            <ApiKeySettings />

            <section className="space-y-3">
              <h2 className="text-sm font-medium text-base-content/50">
                Analytics
              </h2>
              <div className="flex items-start justify-between gap-6">
                <div>
                  <p className="text-sm">Help improve OpenSEO</p>
                  <p className="mt-1 text-sm text-base-content/60">
                    Share analytics and usage data.
                  </p>
                </div>
                <input
                  type="checkbox"
                  className="toggle toggle-primary"
                  checked={analyticsEnabled}
                  disabled={isSessionPending || isSaving || !session?.user}
                  onChange={(event) => {
                    void updateAnalyticsPreference(event.currentTarget.checked);
                  }}
                  aria-label="Enable product analytics"
                />
              </div>
            </section>
          </>
        ) : (
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-base-content/50">About</h2>
            <div className="flex items-center justify-between gap-6">
              <span className="text-sm">Version</span>
              <span className="font-mono text-sm text-base-content/60">
                v{version}
              </span>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

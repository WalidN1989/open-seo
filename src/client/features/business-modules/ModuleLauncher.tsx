import { Link } from "@tanstack/react-router";
import type { ComponentType } from "react";
import type { BusinessModuleKey } from "@/shared/business-modules";

/** Shared presentation only; callers retain their access filtering. */
export function ModuleLauncher({
  moduleKey,
  label,
  Icon,
  accessible,
}: {
  moduleKey: BusinessModuleKey;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  accessible: boolean;
}) {
  return (
    <div className="business-access-launcher">
      {accessible ? (
        <Link
          to={
            moduleKey === "crm"
              ? "/modules/crm"
              : moduleKey === "integrations"
                ? "/modules/integrations"
                : "/modules/$moduleKey"
          }
          params={{ moduleKey }}
          className="business-access-launch-link"
          aria-label={`Open ${label}`}
        />
      ) : null}
      <span
        data-module={moduleKey}
        className="business-access-icon shrink-0 rounded-lg bg-base-200 p-2"
      >
        <Icon className="size-5" />
      </span>
      <h3 className="text-sm font-semibold">{label}</h3>
    </div>
  );
}

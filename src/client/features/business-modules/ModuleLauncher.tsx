import { useProjectAddress } from "@/client/lib/use-project-address";
import { Link } from "@tanstack/react-router";
import type { ComponentType } from "react";
import type { BusinessModuleKey } from "@/shared/business-modules";

/** Shared presentation only; callers retain their access filtering. */
export function ModuleLauncher({
  moduleKey,
  label,
  Icon,
  accessible,
  inventory = false,
  onNavigate,
}: {
  moduleKey: BusinessModuleKey;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  accessible: boolean;
  inventory?: boolean;
  onNavigate?: () => void;
}) {
  const workspaceProjectAddress = useProjectAddress();

  return (
    <div className="business-access-launcher">
      {accessible ? (
        <Link
          to={
            inventory
              ? "/p/$projectId/modules/crm/inventory"
              : moduleKey === "crm"
                ? "/p/$projectId/modules/crm"
                : moduleKey === "integrations"
                  ? "/p/$projectId/modules/integrations"
                  : "/p/$projectId/modules/$moduleKey"
          }
          params={{ projectId: workspaceProjectAddress, moduleKey }}
          onClick={onNavigate}
          className="business-access-launch-link z-10"
          aria-label={`Open ${label}`}
        />
      ) : null}
      <span
        data-module={inventory ? "inventory" : moduleKey}
        className="business-access-icon shrink-0 rounded-lg bg-base-200 p-2"
      >
        <Icon className="size-5" />
      </span>
      <h3 className="text-sm font-semibold">{label}</h3>
    </div>
  );
}

import { ModuleLauncher } from "./ModuleLauncher";
import { InventoryLauncher } from "./InventoryLauncher";
import type { ComponentType } from "react";
import type { BusinessModuleKey } from "@/shared/business-modules";

type ClientModule = {
  key: BusinessModuleKey;
  label: string;
  description: string;
  enabled: boolean;
  permission: string | null;
  hidden: boolean;
};

/**
 * What a client has been given, as a client sees it.
 *
 * The agency's own view of this page is a catalogue with switches: every
 * module, on or off, and who on the team may use it. None of that is a
 * client's business — showing them the switches invites them to turn things
 * on that nobody has set up, and showing them the modules they do not have
 * reads as a locked door. So they get a plain list of what is theirs.
 */
export function ClientModuleList({
  modules,
  icons,
}: {
  modules: ClientModule[];
  icons: Record<BusinessModuleKey, ComponentType<{ className?: string }>>;
}) {
  const available = modules.filter(
    (module) => !module.hidden && module.enabled && module.permission,
  );

  if (available.length === 0) {
    return (
      <div className="alert alert-info">
        Nothing has been switched on for this workspace yet. Your account
        manager turns these on as each part of your business is connected.
      </div>
    );
  }

  return (
    <section className="business-access-active space-y-3">
      <h2 className="text-sm font-semibold">Active modules</h2>
      <div className="business-access-grid">
        {available.map((module) => (
          <article key={module.key} className="business-access-card">
            <ModuleLauncher
              moduleKey={module.key}
              label={module.label}
              Icon={icons[module.key]}
              accessible={true}
            />
          </article>
        ))}
        {available.some((module) => module.key === "crm") ? (
          <InventoryLauncher />
        ) : null}
      </div>
    </section>
  );
}

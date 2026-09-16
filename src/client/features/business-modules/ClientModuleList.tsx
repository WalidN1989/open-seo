import { Link } from "@tanstack/react-router";
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
    <div className="grid gap-4 md:grid-cols-2">
      {available.map((module) => {
        const Icon = icons[module.key];
        return (
          <article
            key={module.key}
            className="rounded-xl border border-base-300 bg-base-100 p-5"
          >
            <div className="flex min-w-0 gap-3">
              <span className="rounded-lg bg-base-200 p-2">
                <Icon className="size-5" />
              </span>
              <div className="min-w-0">
                <h2 className="font-semibold">{module.label}</h2>
                <p className="mt-1 text-sm text-base-content/70">
                  {module.description}
                </p>
              </div>
            </div>
            <div className="mt-5">
              <Link
                to={
                  module.key === "crm"
                    ? "/modules/crm"
                    : module.key === "integrations"
                      ? "/modules/integrations"
                      : "/modules/$moduleKey"
                }
                params={{ moduleKey: module.key }}
                className="btn btn-primary btn-sm"
              >
                Open
              </Link>
            </div>
          </article>
        );
      })}
    </div>
  );
}

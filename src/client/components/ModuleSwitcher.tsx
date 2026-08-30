import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Blocks, Bot, MessagesSquare, PlugZap } from "lucide-react";
import { getBusinessModuleAccess } from "@/serverFunctions/business-modules";
import {
  businessModuleCatalog,
  type BusinessModuleKey,
} from "@/shared/business-modules";

/**
 * Persistent business-module navigation. This deliberately uses the existing
 * sidebar spacing, colours, active marker, and typography; only the information
 * architecture changes. Entitlements decide which modules are visible.
 */
const MODULE_ROUTES: Partial<Record<BusinessModuleKey, string>> = {
  crm: "/modules/crm",
  integrations: "/modules/integrations",
};

function hasIcon(key: string): key is keyof typeof MODULE_ICONS {
  return key in MODULE_ICONS;
}

const MODULE_ICONS = {
  crm: Blocks,
  whatsapp: MessagesSquare,
  voice: Bot,
  integrations: PlugZap,
} satisfies Record<Exclude<BusinessModuleKey, "leads">, typeof Blocks>;

export function ModuleSwitcher({
  moduleKey,
  onNavigate,
}: {
  moduleKey: string;
  onNavigate?: () => void;
}) {
  const access = useQuery({
    queryKey: ["business-modules", "access"],
    queryFn: () => getBusinessModuleAccess(),
    // The sidebar renders on every module route; this rarely changes.
    staleTime: 60_000,
  });

  // Leads is a CRM capability, not a peer product in the navigation. Its
  // entitlement remains independent so a tenant can still buy lead management
  // without receiving the full CRM workspace.
  const granted = access.data?.filter(
    (item) => item.enabled && item.permission,
  );
  const crmAccess = granted?.find((item) => item.key === "crm");
  const leadsAccess = granted?.find((item) => item.key === "leads");
  const available = granted
    ? [
        ...(crmAccess || leadsAccess
          ? [businessModuleCatalog.find((item) => item.key === "crm")!]
          : []),
        ...granted.filter((item) => item.key !== "crm" && item.key !== "leads"),
      ]
    : businessModuleCatalog.filter((item) =>
        moduleKey === "leads" ? item.key === "crm" : item.key === moduleKey,
      );
  const activeModuleKey = moduleKey === "leads" ? "crm" : moduleKey;

  return (
    <div>
      <div className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-base-content/40">
        Business
      </div>
      <nav aria-label="Business" className="space-y-0.5">
        {available.map((item) => {
          const key = item.key;
          // "leads" is presented inside CRM and has no entry here; skip it
          // rather than assert it away.
          if (!hasIcon(key)) return null;
          const Icon = MODULE_ICONS[key];
          const active = key === activeModuleKey;
          const sharedClass = `relative flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
            active
              ? "bg-base-300/50 font-medium text-base-content"
              : "text-base-content/70 hover:bg-base-300/30 hover:text-base-content"
          }`;
          const route = MODULE_ROUTES[key];
          const content = (
            <>
              {active ? (
                <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full bg-primary" />
              ) : null}
              <Icon className="size-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </>
          );

          if (key === "crm" && !crmAccess && leadsAccess) {
            return (
              <Link
                key={key}
                to="/modules/$moduleKey"
                params={{ moduleKey: "leads" }}
                onClick={onNavigate}
                className={sharedClass}
              >
                {content}
              </Link>
            );
          }

          return route ? (
            <Link
              key={key}
              to={route}
              onClick={onNavigate}
              className={sharedClass}
            >
              {content}
            </Link>
          ) : (
            <Link
              key={key}
              to="/modules/$moduleKey"
              params={{ moduleKey: key }}
              onClick={onNavigate}
              className={sharedClass}
            >
              {content}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

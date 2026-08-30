import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Blocks,
  Bot,
  ContactRound,
  LayoutGrid,
  MessagesSquare,
  PlugZap,
} from "lucide-react";
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

const MODULE_ICONS = {
  leads: ContactRound,
  crm: Blocks,
  whatsapp: MessagesSquare,
  voice: Bot,
  integrations: PlugZap,
} satisfies Record<BusinessModuleKey, typeof Blocks>;

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

  // An unentitled module must not appear as a destination. Until the answer
  // arrives, offer only the module already open.
  const available = access.data
    ? access.data.filter((item) => item.enabled && item.permission)
    : businessModuleCatalog.filter((item) => item.key === moduleKey);

  return (
    <div>
      <div className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-base-content/40">
        Business Modules
      </div>
      <nav aria-label="Business modules" className="space-y-0.5">
        {available.map((item) => {
          const Icon = MODULE_ICONS[item.key];
          const active = item.key === moduleKey;
          const sharedClass = `relative flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
            active
              ? "bg-base-300/50 font-medium text-base-content"
              : "text-base-content/70 hover:bg-base-300/30 hover:text-base-content"
          }`;
          const route = MODULE_ROUTES[item.key];
          const content = (
            <>
              {active ? (
                <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full bg-primary" />
              ) : null}
              <Icon className="size-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </>
          );

          return route ? (
            <Link
              key={item.key}
              to={route}
              onClick={onNavigate}
              className={sharedClass}
            >
              {content}
            </Link>
          ) : (
            <Link
              key={item.key}
              to="/modules/$moduleKey"
              params={{ moduleKey: item.key }}
              onClick={onNavigate}
              className={sharedClass}
            >
              {content}
            </Link>
          );
        })}
        <Link
          to="/modules"
          onClick={onNavigate}
          className="mt-1 flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm text-base-content/60 transition-colors hover:bg-base-300/30 hover:text-base-content"
        >
          <LayoutGrid className="size-4 shrink-0" />
          <span>Manage modules</span>
        </Link>
      </nav>
    </div>
  );
}

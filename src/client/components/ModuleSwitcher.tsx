import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronsUpDown, LayoutGrid } from "lucide-react";
import { getBusinessModuleAccess } from "@/serverFunctions/business-modules";
import { businessModuleCatalog } from "@/shared/business-modules";

/**
 * Jump straight between modules without going back out to the catalogue.
 * Inside a module the sidebar belongs to that module, which is the point, but
 * without this the only way from CRM to WhatsApp was back out and in again.
 *
 * Only modules with their own sections are navigable; the rest still open from
 * the catalogue, so this never offers a destination that behaves differently
 * from the one the user just left.
 */
const NAVIGABLE_MODULES: Record<string, string> = {
  crm: "/modules/crm",
  integrations: "/modules/integrations",
};

export function ModuleSwitcher({
  moduleKey,
  onNavigate,
}: {
  moduleKey: string;
  onNavigate?: () => void;
}) {
  const navigate = useNavigate();
  const current = businessModuleCatalog.find((item) => item.key === moduleKey);

  const access = useQuery({
    queryKey: ["business-modules", "access"],
    queryFn: () => getBusinessModuleAccess(),
    // The sidebar renders on every module route; this rarely changes.
    staleTime: 60_000,
  });

  // An unentitled module must not appear as a destination. Until the answer
  // arrives, offer only the module already open.
  const available = (access.data ?? []).filter(
    (item) => item.enabled && item.permission,
  );

  return (
    <div className="dropdown dropdown-bottom w-full">
      <div
        tabIndex={0}
        role="button"
        className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-base-300"
      >
        <span className="min-w-0">
          <span className="block truncate font-medium">
            {current?.label ?? "Module"}
          </span>
          <span className="block truncate text-xs text-base-content/50">
            Business module
          </span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
      </div>
      <ul
        tabIndex={0}
        className="menu dropdown-content z-10 mt-1 w-56 rounded-box border border-base-300 bg-base-100 p-1 shadow"
      >
        {available.map((item) => {
          const to = NAVIGABLE_MODULES[item.key];
          return (
            <li key={item.key}>
              <button
                type="button"
                className={item.key === moduleKey ? "active" : undefined}
                onClick={() => {
                  onNavigate?.();
                  void navigate(
                    to
                      ? { to }
                      : {
                          to: "/modules/$moduleKey",
                          params: { moduleKey: item.key },
                        },
                  );
                }}
              >
                {item.label}
              </button>
            </li>
          );
        })}
        <li className="menu-title mt-1 border-t border-base-300 pt-1">
          <span className="text-xs">Workspace</span>
        </li>
        <li>
          <Link to="/modules" onClick={onNavigate}>
            <LayoutGrid className="size-4" />
            All business modules
          </Link>
        </li>
      </ul>
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { MessageCircle, ShoppingCart, Truck } from "lucide-react";
import { getBusinessModuleAccess } from "@/serverFunctions/business-modules";
import { useProjectAddress } from "@/client/lib/use-project-address";

export function WorkspaceShortcuts() {
  const projectId = useProjectAddress();
  const access = useQuery({
    queryKey: ["business-modules", "access"],
    queryFn: () => getBusinessModuleAccess(),
    enabled: Boolean(projectId),
    staleTime: 60_000,
  });
  const permitted = (key: string) =>
    access.data?.some(
      (module) => module.key === key && module.enabled && module.permission,
    );
  if (!projectId) return null;
  const button =
    "flex size-11 items-center justify-center rounded-full text-white shadow-lg opacity-65 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary";
  return (
    <nav
      aria-label="Workspace shortcuts"
      className="fixed bottom-24 right-[22px] z-40 flex flex-col gap-3 print:hidden md:right-[30px]"
    >
      {permitted("whatsapp") ? (
        <Link
          to="/p/$projectId/modules/$moduleKey"
          params={{ projectId, moduleKey: "whatsapp" }}
          aria-label="Open WhatsApp"
          title="WhatsApp"
          className={`${button} bg-[#128c7e]`}
        >
          <MessageCircle className="size-5" />
        </Link>
      ) : null}
      {permitted("crm") ? (
        <>
          <Link
            to="/p/$projectId/modules/crm/orders"
            params={{ projectId }}
            aria-label="Open Orders"
            title="Orders"
            className={`${button} bg-primary`}
          >
            <ShoppingCart className="size-5" />
          </Link>
          <Link
            to="/p/$projectId/modules/crm/citypak"
            params={{ projectId }}
            aria-label="Open Citypak Waybills"
            title="Citypak Waybills"
            className={`${button} bg-primary`}
          >
            <Truck className="size-5" />
          </Link>
        </>
      ) : null}
    </nav>
  );
}

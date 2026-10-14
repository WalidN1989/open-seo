import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Truck } from "lucide-react";
import { getBusinessModuleAccess } from "@/serverFunctions/business-modules";
export function CitypakShortcut() {
  const access = useQuery({
    queryKey: ["business-modules", "access"],
    queryFn: () => getBusinessModuleAccess(),
    staleTime: 60_000,
  });
  if (
    !access.data?.some(
      (module) => module.key === "crm" && module.enabled && module.permission,
    )
  )
    return null;
  return (
    <Link
      to="/modules/crm/citypak"
      aria-label="Open Citypak Waybills"
      title="Citypak Waybills"
      className="fixed bottom-24 right-5 z-40 flex size-11 items-center justify-center rounded-full bg-primary text-primary-content shadow-lg print:hidden"
    >
      <Truck className="size-5" />
    </Link>
  );
}

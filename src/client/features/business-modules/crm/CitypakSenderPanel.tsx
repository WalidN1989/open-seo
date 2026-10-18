import { useQuery } from "@tanstack/react-query";
import { getBusinessModuleAccess } from "@/serverFunctions/business-modules";
import { getOrderSyncSettings } from "@/serverFunctions/orders";
import { CitypakSenderSettings } from "./CitypakSenderSettings";
import { ErrorState, Loading } from "./inventoryShared";

export function CitypakSenderPanel() {
  const access = useQuery({
    queryKey: ["business-modules", "access"],
    queryFn: () => getBusinessModuleAccess(),
    staleTime: 60_000,
  });
  const canManage = ["crm", "integrations"].every((key) =>
    access.data?.some(
      (module) =>
        module.key === key &&
        module.enabled &&
        ["manage", "admin"].includes(module.permission || ""),
    ),
  );
  const configs = useQuery({
    queryKey: ["commerce", "orderSync"],
    queryFn: () => getOrderSyncSettings(),
    enabled: canManage,
  });
  if (!canManage) return null;
  return (
    <details className="rounded-xl border border-base-300 p-4">
      <summary className="cursor-pointer font-medium">
        Citypak sender settings
      </summary>
      <div className="mt-4 space-y-4">
        {configs.isLoading ? <Loading /> : null}
        {configs.isError ? <ErrorState error={configs.error} /> : null}
        {configs.data?.length === 0 ? (
          <p className="text-sm">
            Connect Shopify in Integrations to set up your Citypak sender
            details.
          </p>
        ) : null}
        {configs.data?.map((config) => (
          <div key={config.connectionId} className="space-y-2">
            <p className="text-sm font-medium">{config.displayName}</p>
            <CitypakSenderSettings connectionId={config.connectionId} />
          </div>
        ))}
      </div>
    </details>
  );
}

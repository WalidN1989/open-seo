import { useQuery } from "@tanstack/react-query";
import { requireBusinessModuleAccess } from "@/serverFunctions/business-modules";
import type { BusinessModuleKey } from "@/shared/business-modules";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

/**
 * Entitlement and staff permission are enforced server-side on every call; this
 * only decides what the shell renders while that answer is pending or negative.
 */
export function ModuleAccessGuard({
  moduleKey,
  children,
}: {
  moduleKey: BusinessModuleKey;
  children: React.ReactNode;
}) {
  const accessQuery = useQuery({
    queryKey: ["business-modules", moduleKey, "access"],
    queryFn: () => requireBusinessModuleAccess({ data: { moduleKey } }),
    retry: false,
  });

  if (accessQuery.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <span className="loading loading-spinner loading-md" />
      </div>
    );
  }
  if (accessQuery.isError) {
    return (
      <div className="alert alert-warning">
        {getStandardErrorMessage(
          accessQuery.error,
          "This module is not available for your account.",
        )}
      </div>
    );
  }
  return <>{children}</>;
}

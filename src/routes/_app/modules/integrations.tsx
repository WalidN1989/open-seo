import { Outlet, createFileRoute, useLocation } from "@tanstack/react-router";
import { ModuleAccessGuard } from "@/client/features/business-modules/ModuleAccessGuard";

export const Route = createFileRoute("/_app/modules/integrations")({
  component: IntegrationsModuleLayout,
});

function IntegrationsModuleLayout() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const isCatalogue = pathname.replace(/\/$/, "") === "/modules/integrations";
  return (
    <div
      className={
        isCatalogue
          ? "h-full min-h-0 overflow-auto bg-base-100 p-4 md:p-6"
          : "h-full overflow-auto bg-base-100 px-4 py-6 pb-24 md:px-6 md:py-7 md:pb-8"
      }
    >
      <div
        className={
          isCatalogue
            ? "mx-auto h-full min-h-0 w-full max-w-[1800px]"
            : "mx-auto w-full max-w-[1500px]"
        }
      >
        <ModuleAccessGuard moduleKey="integrations">
          <Outlet />
        </ModuleAccessGuard>
      </div>
    </div>
  );
}

import { Outlet, createFileRoute } from "@tanstack/react-router";
import { ModuleAccessGuard } from "@/client/features/business-modules/ModuleAccessGuard";

export const Route = createFileRoute("/_app/modules/integrations")({
  component: IntegrationsModuleLayout,
});

function IntegrationsModuleLayout() {
  return (
    <div className="h-full overflow-auto bg-base-100 px-4 py-8 pb-24 md:px-8 md:py-10 md:pb-10">
      <div className="mx-auto w-full max-w-7xl">
        <ModuleAccessGuard moduleKey="integrations">
          <Outlet />
        </ModuleAccessGuard>
      </div>
    </div>
  );
}

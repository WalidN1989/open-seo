import { Outlet, createFileRoute } from "@tanstack/react-router";
import { ModuleAccessGuard } from "@/client/features/business-modules/ModuleAccessGuard";

export const Route = createFileRoute("/_app/modules/integrations")({
  component: IntegrationsModuleLayout,
});

function IntegrationsModuleLayout() {
  return (
    <div className="h-full overflow-auto bg-base-100 px-4 py-6 pb-24 md:px-6 md:py-7 md:pb-8">
      <div className="mx-auto w-full max-w-[1500px]">
        <ModuleAccessGuard moduleKey="integrations">
          <Outlet />
        </ModuleAccessGuard>
      </div>
    </div>
  );
}

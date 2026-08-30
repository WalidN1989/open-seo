import { Outlet, createFileRoute } from "@tanstack/react-router";
import { ModuleAccessGuard } from "@/client/features/business-modules/ModuleAccessGuard";

export const Route = createFileRoute("/_app/modules/crm")({
  component: CrmModuleLayout,
});

// A wide container on purpose: the module owns the whole content area, and its
// sections live in the sidebar rather than stacked into one narrow column.
function CrmModuleLayout() {
  return (
    <div className="h-full overflow-auto bg-base-100 px-4 py-8 pb-24 md:px-8 md:py-10 md:pb-10">
      <div className="mx-auto w-full max-w-7xl">
        <ModuleAccessGuard moduleKey="crm">
          <Outlet />
        </ModuleAccessGuard>
      </div>
    </div>
  );
}

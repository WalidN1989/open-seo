import { Outlet, createFileRoute } from "@tanstack/react-router";
import { ModuleAccessGuard } from "@/client/features/business-modules/ModuleAccessGuard";

export const Route = createFileRoute("/_app/modules/crm")({
  component: CrmModuleLayout,
});

// A wide container on purpose: the module owns the whole content area, and its
// sections live in the sidebar rather than stacked into one narrow column.
function CrmModuleLayout() {
  return (
    <div className="h-full overflow-auto bg-base-100 px-4 py-6 pb-24 md:px-6 md:py-7 md:pb-8">
      <div className="mx-auto w-full max-w-[1500px]">
        <ModuleAccessGuard moduleKey="crm">
          <Outlet />
        </ModuleAccessGuard>
      </div>
    </div>
  );
}

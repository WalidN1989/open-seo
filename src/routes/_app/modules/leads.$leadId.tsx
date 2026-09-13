import { createFileRoute } from "@tanstack/react-router";
import { ModuleAccessGuard } from "@/client/features/business-modules/ModuleAccessGuard";
import { LeadDetailPage } from "@/client/features/business-modules/leads/detail/LeadDetailPage";

export const Route = createFileRoute("/_app/modules/leads/$leadId")({
  component: LeadRoute,
});

function LeadRoute() {
  const { leadId } = Route.useParams();
  return (
    <div className="h-full overflow-auto bg-base-200/30 px-4 py-6 pb-24 md:px-6 md:py-7 md:pb-8">
      <div className="mx-auto w-full max-w-[1500px]">
        <ModuleAccessGuard moduleKey="leads">
          <LeadDetailPage leadId={leadId} />
        </ModuleAccessGuard>
      </div>
    </div>
  );
}

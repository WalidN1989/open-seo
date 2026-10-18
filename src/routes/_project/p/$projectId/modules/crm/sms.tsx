import { createFileRoute } from "@tanstack/react-router";
import { ModuleAccessGuard } from "@/client/features/business-modules/ModuleAccessGuard";
import { SmsWorkspace } from "@/client/features/business-modules/sms/SmsWorkspace";

export const Route = createFileRoute("/_project/p/$projectId/modules/crm/sms")({
  component: CrmSmsView,
});

function CrmSmsView() {
  return (
    <ModuleAccessGuard moduleKey="sms">
      <SmsWorkspace />
    </ModuleAccessGuard>
  );
}

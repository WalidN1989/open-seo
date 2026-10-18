import { createFileRoute } from "@tanstack/react-router";
import { CrmInquiriesView } from "@/client/features/business-modules/crm/views";

export const Route = createFileRoute(
  "/_project/p/$projectId/modules/crm/inquiries",
)({
  component: CrmInquiriesView,
});

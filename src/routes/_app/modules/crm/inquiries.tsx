import { createFileRoute } from "@tanstack/react-router";
import { CrmInquiriesView } from "@/client/features/business-modules/crm/views";

export const Route = createFileRoute("/_app/modules/crm/inquiries")({
  component: CrmInquiriesView,
});

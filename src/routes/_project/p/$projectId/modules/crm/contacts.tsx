import { createFileRoute } from "@tanstack/react-router";
import { CrmContactsView } from "@/client/features/business-modules/crm/views";

export const Route = createFileRoute(
  "/_project/p/$projectId/modules/crm/contacts",
)({
  component: CrmContactsView,
});

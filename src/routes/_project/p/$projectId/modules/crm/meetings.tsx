import { createFileRoute } from "@tanstack/react-router";
import { CrmMeetingsView } from "@/client/features/business-modules/crm/views";

export const Route = createFileRoute(
  "/_project/p/$projectId/modules/crm/meetings",
)({
  component: CrmMeetingsView,
});

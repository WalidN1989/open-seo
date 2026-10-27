import { createFileRoute } from "@tanstack/react-router";
import { SourcesView } from "@/client/features/business-modules/sources/SourcesView";

export const Route = createFileRoute(
  "/_project/p/$projectId/modules/crm/prospects",
)({
  component: SourcesView,
});

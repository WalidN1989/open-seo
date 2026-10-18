import { createFileRoute } from "@tanstack/react-router";
import { CitypakWaybills } from "@/client/features/business-modules/crm/CitypakWaybills";
export const Route = createFileRoute(
  "/_project/p/$projectId/modules/crm/citypak",
)({
  component: CitypakWaybills,
});

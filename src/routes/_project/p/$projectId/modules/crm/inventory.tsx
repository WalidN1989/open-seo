import { createFileRoute } from "@tanstack/react-router";
import { CrmInventoryView } from "@/client/features/business-modules/crm/InventoryView";

export const Route = createFileRoute(
  "/_project/p/$projectId/modules/crm/inventory",
)({
  component: CrmInventoryView,
});

import { createFileRoute } from "@tanstack/react-router";
import { CrmOrdersView } from "@/client/features/business-modules/crm/OrdersView";

export const Route = createFileRoute(
  "/_project/p/$projectId/modules/crm/orders",
)({
  component: CrmOrdersView,
});

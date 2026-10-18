import { createFileRoute } from "@tanstack/react-router";
import { CrmProductDetailView } from "@/client/features/business-modules/crm/ProductDetailView";

export const Route = createFileRoute(
  "/_project/p/$projectId/modules/crm/products/$productId",
)({
  component: CrmProductDetailView,
});

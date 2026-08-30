import { createFileRoute } from "@tanstack/react-router";
import { CrmProductsView } from "@/client/features/business-modules/crm/ProductsView";

export const Route = createFileRoute("/_app/modules/crm/products")({
  component: CrmProductsView,
});

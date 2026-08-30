import { createFileRoute } from "@tanstack/react-router";
import { CrmInventoryView } from "@/client/features/business-modules/crm/InventoryView";

export const Route = createFileRoute("/_app/modules/crm/inventory")({
  component: CrmInventoryView,
});

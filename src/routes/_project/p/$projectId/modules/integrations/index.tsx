import { createFileRoute } from "@tanstack/react-router";
import { IntegrationsCatalogueView } from "@/client/features/business-modules/integrations/CatalogueView";

export const Route = createFileRoute(
  "/_project/p/$projectId/modules/integrations/",
)({
  component: IntegrationsCatalogueView,
});

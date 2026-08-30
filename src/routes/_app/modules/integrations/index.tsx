import { createFileRoute } from "@tanstack/react-router";
import { IntegrationsCatalogueView } from "@/client/features/business-modules/integrations/CatalogueView";

export const Route = createFileRoute("/_app/modules/integrations/")({
  component: IntegrationsCatalogueView,
});

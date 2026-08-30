import { createFileRoute } from "@tanstack/react-router";
import { IntegrationProviderDetailView } from "@/client/features/business-modules/integrations/ProviderDetailView";

export const Route = createFileRoute("/_app/modules/integrations/$providerKey")(
  {
    component: IntegrationProviderDetailView,
  },
);

import { createFileRoute } from "@tanstack/react-router";
import { IntegrationsWorkspace } from "@/client/features/business-modules/CommunicationsWorkspace";

export const Route = createFileRoute("/_app/modules/integrations/connections")({
  component: IntegrationsWorkspace,
});

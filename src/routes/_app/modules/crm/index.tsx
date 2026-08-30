import { createFileRoute } from "@tanstack/react-router";
import { CrmOverviewView } from "@/client/features/business-modules/crm/views";

export const Route = createFileRoute("/_app/modules/crm/")({
  component: CrmOverviewView,
});

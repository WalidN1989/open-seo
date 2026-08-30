import { createFileRoute } from "@tanstack/react-router";
import { CrmCompaniesView } from "@/client/features/business-modules/crm/views";

export const Route = createFileRoute("/_app/modules/crm/companies")({
  component: CrmCompaniesView,
});

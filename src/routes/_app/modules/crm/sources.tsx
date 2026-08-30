import { createFileRoute } from "@tanstack/react-router";
import { SourcesView } from "@/client/features/business-modules/sources/SourcesView";

export const Route = createFileRoute("/_app/modules/crm/sources")({
  component: SourcesView,
});

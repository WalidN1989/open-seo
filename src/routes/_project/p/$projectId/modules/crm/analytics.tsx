import { createFileRoute } from "@tanstack/react-router";
import { BusinessAnalyticsView } from "@/client/features/business-modules/analytics/AnalyticsView";

export const Route = createFileRoute(
  "/_project/p/$projectId/modules/crm/analytics",
)({
  component: BusinessAnalyticsView,
});

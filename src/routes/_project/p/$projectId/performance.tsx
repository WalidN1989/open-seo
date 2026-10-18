import { createFileRoute } from "@tanstack/react-router";
import { PerformancePage } from "@/client/features/performance/PerformancePage";

export const Route = createFileRoute("/_project/p/$projectId/performance")({
  component: PerformancePage,
});

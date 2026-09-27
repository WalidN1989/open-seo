import { createFileRoute } from "@tanstack/react-router";
import { PerformancePage } from "@/client/features/performance/PerformancePage";

export const Route = createFileRoute("/_app/performance")({
  component: PerformancePage,
});

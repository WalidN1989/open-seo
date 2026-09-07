import { createFileRoute } from "@tanstack/react-router";
import { OptimizationsView } from "@/client/features/optimizations/OptimizationsView";

export const Route = createFileRoute<"/_project/p/$projectId/optimizations/">(
  "/_project/p/$projectId/optimizations/",
)({
  component: OptimizationsPage,
});

function OptimizationsPage() {
  const { projectId } = Route.useParams();
  return <OptimizationsView projectId={projectId} />;
}

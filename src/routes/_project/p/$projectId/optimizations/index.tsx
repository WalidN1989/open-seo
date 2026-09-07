import { createFileRoute } from "@tanstack/react-router";
import { OptimizationsView } from "@/client/features/optimizations/OptimizationsView";

export const Route = createFileRoute<"/_project/p/$projectId/optimizations/">(
  "/_project/p/$projectId/optimizations/",
)({
  component: OptimizationsPage,
});

function OptimizationsPage() {
  const { projectId } = Route.useParams();
  return (
    <div className="h-full overflow-auto bg-base-100 p-4 md:p-8">
      <div className="mx-auto w-full max-w-7xl pb-16">
        <OptimizationsView projectId={projectId} />
      </div>
    </div>
  );
}

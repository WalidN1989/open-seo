import { createFileRoute } from "@tanstack/react-router";
import { CompetitorsView } from "@/client/features/competitors/CompetitorsView";

export const Route = createFileRoute<"/_project/p/$projectId/competitors/">(
  "/_project/p/$projectId/competitors/",
)({
  component: CompetitorsPage,
});

function CompetitorsPage() {
  const { projectId } = Route.useParams();
  return (
    <div className="h-full overflow-auto bg-base-100 p-4 md:p-8">
      <div className="mx-auto w-full max-w-5xl pb-16">
        <h1 className="text-3xl font-semibold tracking-tight">Competitors</h1>
        <div className="mt-4">
          <CompetitorsView projectId={projectId} />
        </div>
      </div>
    </div>
  );
}

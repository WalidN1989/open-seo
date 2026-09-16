import { createFileRoute } from "@tanstack/react-router";
import { DemoOverview } from "@/client/features/business-modules/demo/DemoOverview";

export const Route = createFileRoute("/_app/modules/overview")({
  component: OverviewPage,
});

function OverviewPage() {
  return (
    <div className="h-full overflow-y-auto px-4 py-6 md:px-6">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-4 text-xl font-semibold">
          Your business at a glance
        </h1>
        <DemoOverview />
      </div>
    </div>
  );
}

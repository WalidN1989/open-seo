import { createFileRoute } from "@tanstack/react-router";
import { QuotesSection } from "@/client/features/business-modules/quotes/QuotesSection";

export const Route = createFileRoute("/_app/modules/crm/quotations")({
  component: CrmQuotationsView,
});

function CrmQuotationsView() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Quotations</h1>
        <p className="text-sm text-base-content/60">
          Quotes built from your products and services, and where each one
          stands.
        </p>
      </div>
      <QuotesSection />
    </div>
  );
}

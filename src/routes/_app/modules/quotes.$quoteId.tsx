import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ModuleAccessGuard } from "@/client/features/business-modules/ModuleAccessGuard";
import { QuotePage } from "@/client/features/business-modules/quotes/QuotePage";

export const Route = createFileRoute("/_app/modules/quotes/$quoteId")({
  validateSearch: z.object({
    leadId: z.string().min(1).optional(),
    edit: z.boolean().optional(),
  }),
  component: QuoteRoute,
});

function QuoteRoute() {
  const { quoteId } = Route.useParams();
  const { leadId, edit } = Route.useSearch();
  return (
    <div className="h-full overflow-auto bg-base-200/30 px-4 py-6 pb-24 md:px-6 md:py-7 md:pb-8 print:bg-transparent print:p-0">
      <div className="mx-auto w-full max-w-5xl">
        <ModuleAccessGuard moduleKey="invoicing">
          <QuotePage
            quoteId={quoteId}
            leadId={leadId ?? null}
            edit={Boolean(edit)}
          />
        </ModuleAccessGuard>
      </div>
    </div>
  );
}

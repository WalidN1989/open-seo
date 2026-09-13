import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { QuoteDocument } from "@/client/features/business-modules/quotes/QuoteDocument";
import { getQuoteDocument } from "@/serverFunctions/quotes";

/**
 * The quote as the client sees it. Outside the authenticated layouts: the
 * signed token in the query string is the credential, naming one quote in one
 * workspace for a limited time.
 */
export const Route = createFileRoute<"/quotes/$quoteId">("/quotes/$quoteId")({
  validateSearch: z.object({ t: z.string().optional() }),
  component: SharedQuotePage,
});

function SharedQuotePage() {
  const { t } = Route.useSearch();
  const query = useQuery({
    queryKey: ["shared-quote", t],
    queryFn: () => getQuoteDocument({ data: { token: t ?? "" } }),
    enabled: Boolean(t),
    retry: false,
  });

  if (!t || query.isError) {
    return (
      <main className="mx-auto max-w-lg px-6 py-24 text-center">
        <h1 className="text-xl font-semibold">This link is no longer valid</h1>
        <p className="mt-2 text-sm opacity-70">
          Quote links expire. Ask whoever sent it for a fresh one.
        </p>
      </main>
    );
  }
  if (query.isPending) {
    return (
      <main className="flex justify-center py-24">
        <span className="loading loading-spinner" />
      </main>
    );
  }
  return (
    <main className="h-dvh overflow-y-auto bg-base-200/40 py-8 print:h-auto print:overflow-visible">
      <div className="mx-auto max-w-4xl px-4">
        <QuoteDocument detail={query.data} />
        <p className="mt-6 text-center text-xs opacity-60 print:hidden">
          Use your browser&rsquo;s print option to save this as a PDF.
        </p>
      </div>
    </main>
  );
}

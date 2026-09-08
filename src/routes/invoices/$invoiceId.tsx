import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { InvoiceDocument } from "@/client/features/business-modules/invoicing/InvoiceDocument";
import { getInvoiceDocument } from "@/serverFunctions/invoicing";

/**
 * The invoice as its recipient sees it.
 *
 * Outside the authenticated layouts on purpose: this is the page a client
 * opens from a link in an email, and they have no account. The signed token in
 * the query string is the credential, and it names one invoice in one
 * workspace for a limited time.
 */
export const Route = createFileRoute<"/invoices/$invoiceId">(
  "/invoices/$invoiceId",
)({
  validateSearch: z.object({ t: z.string().optional() }),
  component: SharedInvoicePage,
});

function SharedInvoicePage() {
  const { t } = Route.useSearch();
  const query = useQuery({
    queryKey: ["shared-invoice", t],
    queryFn: () => getInvoiceDocument({ data: { token: t! } }),
    enabled: Boolean(t),
    retry: false,
  });

  if (!t || query.isError) {
    return (
      <main className="mx-auto max-w-lg px-6 py-24 text-center">
        <h1 className="text-xl font-semibold">This link is no longer valid</h1>
        <p className="mt-2 text-sm opacity-70">
          Invoice links expire. Ask whoever sent it for a fresh one.
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
  if (!query.data) return null;

  return (
    <main className="min-h-screen bg-base-200/40 py-8">
      <div className="mx-auto max-w-4xl px-4">
        <InvoiceDocument detail={query.data} />
        <p className="mt-6 text-center text-xs opacity-60 print:hidden">
          Use your browser&rsquo;s print option to save this as a PDF.
        </p>
      </div>
    </main>
  );
}

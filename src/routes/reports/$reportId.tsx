import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { ClientReportDocument } from "@/client/features/business-modules/reports/ClientReportDocument";
import { getClientReportDocument } from "@/serverFunctions/reports";

/**
 * The report as its recipient sees it.
 *
 * Outside the authenticated layouts on purpose: this is the page a client
 * opens from a link, and they have no account. The signed token in the query
 * string is the credential, and it names one report in one workspace for a
 * limited time.
 */
export const Route = createFileRoute<"/reports/$reportId">(
  "/reports/$reportId",
)({
  validateSearch: z.object({ t: z.string().optional() }),
  component: SharedReportPage,
});

function SharedReportPage() {
  const { t } = Route.useSearch();
  const query = useQuery({
    queryKey: ["shared-report", t],
    queryFn: () => getClientReportDocument({ data: { token: t! } }),
    enabled: Boolean(t),
    retry: false,
  });

  if (!t || query.isError) {
    return (
      <main className="mx-auto max-w-lg px-6 py-24 text-center">
        <h1 className="text-xl font-semibold">This link is no longer valid</h1>
        <p className="mt-2 text-sm opacity-70">
          Report links expire. Ask whoever sent it for a fresh one.
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
        <ClientReportDocument snapshot={query.data.snapshot} />
        <p className="mt-6 text-center text-xs opacity-60 print:hidden">
          Use your browser&rsquo;s print option to save this as a PDF.
        </p>
      </div>
    </main>
  );
}

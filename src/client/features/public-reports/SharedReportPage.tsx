import { useQuery } from "@tanstack/react-query";
import { getClientReportDocument } from "@/serverFunctions/reports";
import { ClientReportDocument } from "@/client/features/business-modules/reports/ClientReportDocument";

/**
 * The report as its recipient sees it, reached by a long signed link or a
 * short code. Outside the authenticated layouts on purpose: a client has no
 * account, and the link is the whole credential.
 */
export function SharedReportPage({
  token,
  code,
}: {
  token?: string;
  code?: string;
}) {
  const credential = token ? { token } : code ? { code } : null;
  const query = useQuery({
    queryKey: ["shared-report", token ?? null, code ?? null],
    queryFn: () => getClientReportDocument({ data: credential ?? {} }),
    enabled: Boolean(credential),
    retry: false,
  });

  if (!credential || query.isError) {
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

  // The app shell locks html/body to the viewport so its own panes scroll;
  // this page has no shell, so it is the scroll container.
  return (
    <main className="h-dvh overflow-y-auto bg-base-200/40 py-8 print:h-auto print:overflow-visible">
      <div className="mx-auto max-w-4xl px-4">
        <ClientReportDocument snapshot={query.data.snapshot} />
        <p className="mt-6 text-center text-xs opacity-60 print:hidden">
          Use your browser&rsquo;s print option to save this as a PDF.
        </p>
      </div>
    </main>
  );
}

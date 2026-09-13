import { Link } from "@tanstack/react-router";
import { FileSignature, Plus } from "lucide-react";
import { formatMoney } from "@/server/features/invoicing/invoiceTotals";
import {
  QUOTE_STATUS_LABEL,
  QUOTE_STATUS_TONE,
  useLeadQuotes,
} from "../../quotes/quotesQuery";

/** Quotes raised for this lead, and the way to raise another. */
export function LeadQuotesCard({ leadId }: { leadId: string }) {
  const query = useLeadQuotes(leadId);
  if (!query.data?.canQuote) return null;
  const { quotes } = query.data;
  return (
    <div className="rounded-xl border border-base-300 bg-base-100">
      <div className="flex items-center gap-2 border-b border-base-300 p-3">
        <span className="text-sm font-semibold">Quotations</span>
        <span className="rounded-full bg-base-200 px-2 text-xs text-base-content/60">
          {quotes.length}
        </span>
        <Link
          to="/modules/quotes/$quoteId"
          params={{ quoteId: "new" }}
          search={{ leadId }}
          className="btn btn-ghost btn-xs ml-auto"
        >
          <Plus className="size-3.5" /> New
        </Link>
      </div>
      {quotes.length === 0 ? (
        <p className="p-3 text-sm text-base-content/55">No quotes yet.</p>
      ) : (
        <ul className="divide-y divide-base-200">
          {quotes.map((quote) => (
            <li key={quote.id}>
              <Link
                to="/modules/quotes/$quoteId"
                params={{ quoteId: quote.id }}
                className="flex items-center gap-2 px-3 py-2 hover:bg-base-200/50"
              >
                <FileSignature className="size-4 shrink-0 text-base-content/50" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    {quote.number}
                  </span>
                  <span className="block truncate text-xs text-base-content/55">
                    {formatMoney(quote.totalMinor, quote.currency)} · valid
                    until {quote.validUntil}
                  </span>
                </span>
                <span
                  className={`badge badge-sm ${QUOTE_STATUS_TONE[quote.status]}`}
                >
                  {QUOTE_STATUS_LABEL[quote.status]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

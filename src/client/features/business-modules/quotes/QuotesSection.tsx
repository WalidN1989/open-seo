import { Link } from "@tanstack/react-router";
import { FileSignature, Plus } from "lucide-react";
import { formatMoney } from "@/server/features/invoicing/invoiceTotals";
import {
  QUOTE_STATUS_LABEL,
  QUOTE_STATUS_TONE,
  useQuotesWorkspace,
} from "./quotesQuery";

/** The Quotes tab of the invoicing workspace. */
export function QuotesSection() {
  const query = useQuotesWorkspace();
  if (query.isPending) {
    return (
      <div className="flex justify-center py-10">
        <span className="loading loading-spinner" />
      </div>
    );
  }
  const quotes = query.data?.quotes ?? [];
  return (
    <div className="space-y-3">
      <Link
        to="/modules/quotes/$quoteId"
        params={{ quoteId: "new" }}
        className="btn btn-primary btn-sm"
      >
        <Plus className="size-4" /> New quote
      </Link>
      {quotes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-base-300 py-12 text-center text-sm text-base-content/55">
          <FileSignature className="mx-auto mb-2 size-6 opacity-50" />
          No quotes yet. Start one here, from a lead, or ask Grok to draft one.
        </div>
      ) : (
        quotes.map((quote) => (
          <Link
            key={quote.id}
            to="/modules/quotes/$quoteId"
            params={{ quoteId: quote.id }}
            className="flex w-full flex-wrap items-center gap-3 rounded-xl border border-base-300 px-4 py-3 text-left transition-colors hover:bg-base-200/60"
          >
            <span
              className={`badge badge-sm ${QUOTE_STATUS_TONE[quote.status]}`}
            >
              {QUOTE_STATUS_LABEL[quote.status]}
            </span>
            <span className="font-mono text-sm">{quote.number}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">
                {quote.clientName}
              </span>
              {quote.title ? (
                <span className="block truncate text-xs text-base-content/55">
                  {quote.title}
                </span>
              ) : null}
            </span>
            <span className="text-xs text-base-content/55">
              Valid until {quote.validUntil}
            </span>
            <span className="text-sm font-semibold">
              {formatMoney(quote.totalMinor, quote.currency)} {quote.currency}
            </span>
          </Link>
        ))
      )}
    </div>
  );
}

import { quoteStatusSchema } from "@/types/schemas/quotes";
import type { QuoteRow } from "./repositories/QuoteRepository";
import { effectiveQuoteStatus, todayIso } from "./quoteRules";

type LineRow = {
  id: string;
  productId: string | null;
  description: string;
  detail: string | null;
  quantityMilli: number;
  unitPriceMinor: number;
  amountMinor: number;
};

/** What callers see of a quote; the status is as it reads today. */
export function publicQuote(row: QuoteRow, today = todayIso()) {
  const stored = quoteStatusSchema.catch("draft").parse(row.status);
  return {
    id: row.id,
    number: row.number,
    status: effectiveQuoteStatus(stored, row.validUntil, today),
    leadId: row.leadId,
    contactId: row.contactId,
    companyId: row.companyId,
    title: row.title,
    clientName: row.clientName,
    clientAddressLines: row.clientAddressLines,
    clientEmail: row.clientEmail,
    clientTaxIdLabel: row.clientTaxIdLabel,
    clientTaxIdValue: row.clientTaxIdValue,
    currency: row.currency,
    issueDate: row.issueDate,
    validUntil: row.validUntil,
    notes: row.notes,
    terms: row.terms,
    taxLabel: row.taxLabel,
    taxRatePercent: row.taxRatePercent,
    subtotalMinor: row.subtotalMinor,
    taxMinor: row.taxMinor,
    totalMinor: row.totalMinor,
    sentAt: row.sentAt,
    respondedAt: row.respondedAt,
    convertedInvoiceId: row.convertedInvoiceId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function publicLines(lines: readonly LineRow[]) {
  return lines.map((line) => ({
    id: line.id,
    productId: line.productId,
    description: line.description,
    detail: line.detail,
    quantityMilli: line.quantityMilli,
    unitPriceMinor: line.unitPriceMinor,
    amountMinor: line.amountMinor,
  }));
}

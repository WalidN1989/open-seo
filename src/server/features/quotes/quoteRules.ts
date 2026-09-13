/**
 * The life of a quote, kept free of the database so it can be tested directly.
 *
 * A draft is the only editable state. Once sent, the client's answer is what
 * moves it: accepted or declined, or expired when its valid-until date passes
 * without one. A sent or expired quote can be pulled back to draft to fix a
 * mistake or a date; an answered one cannot, because someone relied on it.
 */
import type { QuoteStatus } from "@/types/schemas/quotes";

const TRANSITIONS: Record<QuoteStatus, readonly QuoteStatus[]> = {
  draft: ["sent"],
  sent: ["accepted", "declined", "expired", "draft"],
  accepted: [],
  declined: [],
  expired: ["draft"],
};

export function canMoveQuote(from: QuoteStatus, to: QuoteStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** What a stored status reads as today: a sent quote past its date has expired. */
export function effectiveQuoteStatus(
  status: QuoteStatus,
  validUntil: string,
  today: string,
): QuoteStatus {
  return status === "sent" && validUntil < today ? "expired" : status;
}

export function todayIso(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

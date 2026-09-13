/**
 * The life of a quote, kept free of the database so it can be tested directly.
 *
 * A draft is the only editable state. Once sent, the client's answer is what
 * moves it: accepted or declined, or expired when its valid-until date passes
 * without one. A sent quote can be pulled back to draft to fix a mistake; an
 * answered one cannot, because someone has already relied on it.
 */
import type { QuoteStatus } from "@/types/schemas/quotes";

const TRANSITIONS: Record<QuoteStatus, readonly QuoteStatus[]> = {
  draft: ["sent"],
  sent: ["accepted", "declined", "expired", "draft"],
  accepted: [],
  declined: [],
  expired: ["sent"],
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

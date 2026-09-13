/**
 * Signed, time-limited links to a quote, for the client who has no account.
 * Same signing as invoice links, with claims that can only name a quote, so
 * an invoice token can never be replayed against a quote or the reverse.
 */
import {
  DOCUMENT_LINK_TTL_MS,
  signToken,
  verifyToken,
} from "@/server/lib/signed-token";

type QuoteClaims = {
  quoteId: string;
  organizationId: string;
  /** Epoch milliseconds. */
  expiresAt: number;
};

function isQuoteClaims(value: unknown): value is QuoteClaims {
  if (typeof value !== "object" || value === null) return false;
  return (
    "quoteId" in value &&
    typeof value.quoteId === "string" &&
    "organizationId" in value &&
    typeof value.organizationId === "string" &&
    "expiresAt" in value &&
    typeof value.expiresAt === "number" &&
    !("invoiceId" in value)
  );
}

export function signQuoteToken(claims: QuoteClaims, secret: string) {
  return signToken(claims, secret);
}

export async function verifyQuoteToken(
  token: string,
  secret: string,
  now: number,
): Promise<QuoteClaims | null> {
  const claims = await verifyToken(token, secret, isQuoteClaims);
  if (!claims || claims.expiresAt <= now) return null;
  return claims;
}

export const QUOTE_LINK_TTL_MS = DOCUMENT_LINK_TTL_MS;

export function quotePath(quoteId: string, token: string): string {
  return `/quotes/${encodeURIComponent(quoteId)}?t=${encodeURIComponent(token)}`;
}

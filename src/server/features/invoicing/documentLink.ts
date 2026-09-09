/**
 * Signed, time-limited links to an invoice document.
 *
 * The document is the thing a client receives, so the link has to work without
 * a session — but it addresses one invoice, expires, and cannot be edited into
 * addressing another. The signing itself lives in `signed-token`, shared with
 * the other document a client is sent; the wire format is unchanged.
 */
import {
  DOCUMENT_LINK_TTL_MS,
  signToken,
  verifyToken,
} from "@/server/lib/signed-token";

export type DocumentClaims = {
  invoiceId: string;
  organizationId: string;
  /** Epoch milliseconds. */
  expiresAt: number;
};

function isDocumentClaims(value: unknown): value is DocumentClaims {
  if (typeof value !== "object" || value === null) return false;
  return (
    "invoiceId" in value &&
    typeof value.invoiceId === "string" &&
    "organizationId" in value &&
    typeof value.organizationId === "string" &&
    "expiresAt" in value &&
    typeof value.expiresAt === "number"
  );
}

/**
 * `<payload>.<signature>`.
 *
 * The organization travels inside the signature rather than being trusted from
 * the URL, so a link cannot be pointed at another workspace's invoice.
 */
export async function signDocumentToken(
  claims: DocumentClaims,
  secret: string,
): Promise<string> {
  return signToken(claims, secret);
}

export async function verifyDocumentToken(
  token: string,
  secret: string,
  now: number,
): Promise<DocumentClaims | null> {
  const claims = await verifyToken(token, secret, isDocumentClaims);
  if (!claims) return null;
  if (claims.expiresAt <= now) return null;
  return claims;
}

export { DOCUMENT_LINK_TTL_MS };

export function documentPath(invoiceId: string, token: string): string {
  return `/invoices/${encodeURIComponent(invoiceId)}?t=${encodeURIComponent(token)}`;
}

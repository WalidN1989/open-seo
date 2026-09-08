/**
 * Signed, time-limited links to an invoice document.
 *
 * The document is the thing a client receives, so the link has to work without
 * a session — but it addresses one invoice, expires, and cannot be edited into
 * addressing another. Free of database imports so the signing and the
 * expiry can be tested directly.
 */

const ENCODER = new TextEncoder();

export type DocumentClaims = {
  invoiceId: string;
  organizationId: string;
  /** Epoch milliseconds. */
  expiresAt: number;
};

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

async function key(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    ENCODER.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
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
  const payload = base64url(ENCODER.encode(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await key(secret),
    ENCODER.encode(payload),
  );
  return `${payload}.${base64url(new Uint8Array(signature))}`;
}

export async function verifyDocumentToken(
  token: string,
  secret: string,
  now: number,
): Promise<DocumentClaims | null> {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  let valid = false;
  try {
    valid = await crypto.subtle.verify(
      "HMAC",
      await key(secret),
      fromBase64url(signature),
      ENCODER.encode(payload),
    );
  } catch {
    // A malformed signature is a failed verification, not a server error.
    return null;
  }
  if (!valid) return null;

  let claims: DocumentClaims;
  try {
    claims = JSON.parse(
      new TextDecoder().decode(fromBase64url(payload)),
    ) as DocumentClaims;
  } catch {
    return null;
  }

  if (
    typeof claims.invoiceId !== "string" ||
    typeof claims.organizationId !== "string" ||
    typeof claims.expiresAt !== "number"
  ) {
    return null;
  }
  if (claims.expiresAt <= now) return null;
  return claims;
}

/** How long a minted link stays good. Long enough to email, short enough to matter. */
export const DOCUMENT_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function documentPath(invoiceId: string, token: string): string {
  return `/invoices/${encodeURIComponent(invoiceId)}?t=${encodeURIComponent(token)}`;
}

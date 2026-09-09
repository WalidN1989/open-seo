/**
 * `<payload>.<signature>` tokens for links that must work without a session.
 *
 * Extracted from the invoice document link so a second kind of shared document
 * does not mean a second copy of the signing. The wire format is unchanged:
 * base64url JSON, a detached HMAC-SHA256, and whatever the claims say.
 *
 * The rule these exist to enforce is that the workspace travels *inside* the
 * signature. A link cannot be edited into addressing another tenant's
 * document, because editing it breaks the signature.
 *
 * Free of database imports, so signing and expiry can be tested directly.
 */

const ENCODER = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
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

export async function signToken(
  claims: Record<string, unknown>,
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

/**
 * The claims, or null. `shape` decides what a valid claim set looks like, so a
 * caller can never be handed a token that verified but says something else.
 */
export async function verifyToken<T>(
  token: string,
  secret: string,
  shape: (value: unknown) => value is T,
): Promise<T | null> {
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

  try {
    const claims: unknown = JSON.parse(
      new TextDecoder().decode(fromBase64url(payload)),
    );
    return shape(claims) ? claims : null;
  } catch {
    return null;
  }
}

/** How long a minted link stays good. Long enough to email, short enough to matter. */
export const DOCUMENT_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

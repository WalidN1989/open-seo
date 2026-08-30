const encoder = new TextEncoder();

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function hmac(
  algorithm: "SHA-1" | "SHA-256",
  secret: string,
  value: string,
): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: algorithm },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", key, encoder.encode(value));
}

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function base64(buffer: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(buffer))
    binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function verifyMetaSignature(
  rawBody: string,
  signature: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${hex(await hmac("SHA-256", appSecret, rawBody))}`;
  return constantTimeEqual(signature, expected);
}

export async function verifyTwilioSignature(
  url: string,
  params: Readonly<Record<string, string>>,
  signature: string | null,
  authToken: string,
): Promise<boolean> {
  if (!signature) return false;
  const payload = Object.keys(params)
    .toSorted()
    .reduce((value, key) => `${value}${key}${params[key]}`, url);
  const expected = base64(await hmac("SHA-1", authToken, payload));
  return constantTimeEqual(signature, expected);
}

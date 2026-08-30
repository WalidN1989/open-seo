const APP_SECRET = "platform-app-secret";

/**
 * Signing and payload construction for the Meta webhook suites. Extracted so
 * the suites stay under the file-length ceiling without dropping any case.
 */
/** Meta's own signature scheme: HMAC-SHA256 over the raw body. */
export async function sign(body: string, secret = APP_SECRET) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  );
  const hex = [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256=${hex}`;
}

export function headersFor(signature: string) {
  return new Headers({ "x-hub-signature-256": signature });
}

export function delivery(
  groups: Array<{
    waba: string;
    phoneNumberId: string;
    messages?: Array<{ id: string; from: string; body: string }>;
    statuses?: Array<{ id: string; status: string }>;
  }>,
) {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: groups.map((group) => ({
      id: group.waba,
      changes: [
        {
          value: {
            metadata: {
              phone_number_id: group.phoneNumberId,
              display_phone_number: "+94110000000",
            },
            messages: (group.messages ?? []).map((m) => ({
              id: m.id,
              from: m.from,
              type: "text",
              timestamp: "1756512000",
              text: { body: m.body },
            })),
            statuses: group.statuses ?? [],
          },
        },
      ],
    })),
  });
}

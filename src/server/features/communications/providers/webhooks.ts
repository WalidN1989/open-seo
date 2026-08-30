import { getRequiredEnvValue } from "@/server/lib/runtime-env";

const encoder = new TextEncoder();
const blockedHostnames = new Set(["localhost", "localhost.localdomain"]);

export function validateWebhookUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error("Webhook endpoints must use HTTPS.");
  }
  const hostname = url.hostname.toLowerCase();
  if (
    blockedHostnames.has(hostname) ||
    hostname.endsWith(".local") ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname.startsWith("127.") ||
    hostname.startsWith("10.") ||
    hostname.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  ) {
    throw new Error("Webhook endpoints cannot target private networks.");
  }
  return url;
}

export async function resolveWebhookSecret(reference: string): Promise<string> {
  const name = reference
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_");
  return getRequiredEnvValue(`${name}_SIGNING_SECRET`);
}

export async function signWebhookPayload(
  secret: string,
  timestamp: string,
  body: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}.${body}`),
  );
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function deliverWebhook(
  endpoint: { url: string | null; secretReference: string | null },
  eventType: string,
  body: string,
  deliveryId: string,
  fetcher: typeof fetch = fetch,
) {
  if (!endpoint.url || !endpoint.secretReference) {
    throw new Error("Webhook endpoint is missing its URL or secret reference.");
  }
  const url = validateWebhookUrl(endpoint.url);
  const secret = await resolveWebhookSecret(endpoint.secretReference);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = await signWebhookPayload(secret, timestamp, body);
  const response = await fetcher(url, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "OpenSEO-Webhooks/1.0",
      "X-OpenSEO-Delivery": deliveryId,
      "X-OpenSEO-Event": eventType,
      "X-OpenSEO-Timestamp": timestamp,
      "X-OpenSEO-Signature": `v1=${signature}`,
    },
    body,
  });
  const responseBody = (await response.text()).slice(0, 4096);
  return { status: response.status, responseBody, ok: response.ok };
}

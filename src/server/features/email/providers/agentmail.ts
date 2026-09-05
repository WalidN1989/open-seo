/**
 * AgentMail over plain fetch. No SDK: the app's server runtime is workerd and
 * every call here is a JSON request with a bearer key. Errors carry the
 * status and host, never the key or the body, so they can be shown to the
 * operator as they are.
 */

const BASE_URL = "https://api.agentmail.to/v0";

export type AgentmailPod = {
  pod_id: string;
  name?: string;
  client_id?: string;
};
export type AgentmailInbox = {
  pod_id: string;
  inbox_id: string;
  email: string;
  display_name?: string;
};
export type AgentmailApiKey = {
  api_key_id: string;
  api_key: string;
  prefix: string;
  pod_id?: string;
};
export type AgentmailWebhook = {
  webhook_id: string;
  url: string;
  secret: string;
  enabled: boolean;
};
export type AgentmailSendResult = { message_id: string; thread_id: string };

export type AgentmailMessage = {
  inbox_id: string;
  thread_id: string;
  message_id: string;
  labels?: string[];
  timestamp: string;
  from: string;
  to?: string[];
  cc?: string[];
  subject?: string;
  preview?: string;
  text?: string;
  html?: string;
};
export type AgentmailThread = {
  inbox_id: string;
  thread_id: string;
  labels?: string[];
  timestamp: string;
  senders?: string[];
  recipients?: string[];
  subject?: string;
  preview?: string;
  last_message_id?: string;
  message_count?: number;
};

export type AgentmailEvent =
  | {
      event_type:
        | "message.received"
        | "message.received.spam"
        | "message.received.blocked"
        | "message.received.unauthenticated";
      event_id: string;
      message: AgentmailMessage;
      thread?: AgentmailThread;
    }
  | {
      event_type: "message.sent" | "message.delivered";
      event_id: string;
      send: { inbox_id: string; thread_id: string; message_id: string };
    }
  | {
      event_type: "message.bounced" | "message.complained" | "message.rejected";
      event_id: string;
      bounce?: { inbox_id: string; thread_id: string; message_id: string };
      complaint?: { inbox_id: string; thread_id: string; message_id: string };
      reject?: { inbox_id: string; thread_id: string; message_id: string };
    }
  | { event_type: string; event_id: string };

export class AgentmailError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    detail?: string,
  ) {
    super(
      `AgentMail returned ${status} for ${path}${detail ? `: ${detail}` : ""}`,
    );
  }
}

async function call<T>(
  apiKey: string,
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown,
  fetcher: typeof fetch = fetch,
): Promise<T> {
  const response = await fetcher(`${BASE_URL}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status >= 300 && response.status < 400) {
    throw new AgentmailError(response.status, path, "unexpected redirect");
  }
  const text = await response.text();
  if (!response.ok) {
    let detail = text.slice(0, 200);
    try {
      const parsed = JSON.parse(text) as { message?: string; error?: string };
      detail = parsed.message || parsed.error || detail;
    } catch {
      // keep the raw excerpt
    }
    throw new AgentmailError(response.status, path, detail);
  }
  const parsed: unknown = text ? JSON.parse(text) : {};
  // Each method names the documented response shape; the API is the contract.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see above
  return parsed as T;
}

/** A client bound to one key. The org-level key is used once, at connect. */
export function agentmailClient(apiKey: string, fetcher: typeof fetch = fetch) {
  return {
    whoami: () =>
      call<{ organization_id?: string }>(
        apiKey,
        "GET",
        "/auth/whoami",
        undefined,
        fetcher,
      ),
    createPod: (input: { name?: string; client_id?: string }) =>
      call<AgentmailPod>(apiKey, "POST", "/pods", input, fetcher),
    createPodInbox: (
      podId: string,
      input: {
        username?: string;
        domain?: string;
        display_name?: string;
        client_id?: string;
      },
    ) =>
      call<AgentmailInbox>(
        apiKey,
        "POST",
        `/pods/${encodeURIComponent(podId)}/inboxes`,
        input,
        fetcher,
      ),
    createPodApiKey: (
      podId: string,
      input: { name?: string; permissions?: Record<string, boolean> },
    ) =>
      call<AgentmailApiKey>(
        apiKey,
        "POST",
        `/pods/${encodeURIComponent(podId)}/api-keys`,
        input,
        fetcher,
      ),
    createWebhook: (input: {
      url: string;
      event_types: string[];
      inbox_ids?: string[];
      client_id?: string;
    }) => call<AgentmailWebhook>(apiKey, "POST", "/webhooks", input, fetcher),
    deleteWebhook: (webhookId: string) =>
      call<unknown>(
        apiKey,
        "DELETE",
        `/webhooks/${encodeURIComponent(webhookId)}`,
        undefined,
        fetcher,
      ),
    sendMessage: (
      inboxId: string,
      input: {
        to: string[];
        cc?: string[];
        subject?: string;
        text?: string;
        html?: string;
        labels?: string[];
      },
    ) =>
      call<AgentmailSendResult>(
        apiKey,
        "POST",
        `/inboxes/${encodeURIComponent(inboxId)}/messages/send`,
        input,
        fetcher,
      ),
    replyToMessage: (
      inboxId: string,
      messageId: string,
      input: { text?: string; html?: string; reply_all?: boolean },
    ) =>
      call<AgentmailSendResult>(
        apiKey,
        "POST",
        `/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(messageId)}/reply`,
        input,
        fetcher,
      ),
    getMessage: (inboxId: string, messageId: string) =>
      call<AgentmailMessage>(
        apiKey,
        "GET",
        `/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(messageId)}`,
        undefined,
        fetcher,
      ),
  };
}

/** What a pod-scoped key needs for running one inbox; nothing org-wide. */
export const POD_KEY_PERMISSIONS: Record<string, boolean> = {
  inbox_read: true,
  message_read: true,
  message_send: true,
  message_update: true,
  draft_read: true,
  draft_create: true,
  draft_update: true,
  draft_delete: true,
  draft_send: true,
};

export const WEBHOOK_EVENT_TYPES = [
  "message.received",
  "message.sent",
  "message.delivered",
  "message.bounced",
  "message.complained",
  "message.rejected",
];

const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1)
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * AgentMail signs webhooks the Svix way: HMAC-SHA256 over
 * `${id}.${timestamp}.${body}` with the base64 secret after its `whsec_`
 * prefix, sent as space-separated `v1,<base64>` entries. Implemented with
 * WebCrypto so the runtime needs no extra package; the raw body must be the
 * exact bytes received.
 */
export async function verifyAgentmailSignature(input: {
  secret: string;
  headers: Headers;
  rawBody: string;
  now?: number;
}): Promise<boolean> {
  const id = input.headers.get("svix-id");
  const timestamp = input.headers.get("svix-timestamp");
  const signatures = input.headers.get("svix-signature");
  if (!id || !timestamp || !signatures) return false;
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds)) return false;
  const now = Math.floor((input.now ?? Date.now()) / 1000);
  if (Math.abs(now - seconds) > TIMESTAMP_TOLERANCE_SECONDS) return false;
  const secret = input.secret.startsWith("whsec_")
    ? input.secret.slice("whsec_".length)
    : input.secret;
  const key = await crypto.subtle.importKey(
    "raw",
    base64ToBytes(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${input.rawBody}`),
  );
  const expected = bytesToBase64(signed);
  return signatures.split(" ").some((entry) => {
    const [version, value] = entry.split(",");
    return version === "v1" && !!value && timingSafeEqual(value, expected);
  });
}

function isAgentmailEvent(value: unknown): value is AgentmailEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { event_type?: unknown }).event_type === "string" &&
    typeof (value as { event_id?: unknown }).event_id === "string"
  );
}

/** Parse a webhook body defensively; unknown shapes become an unknown event. */
export function parseAgentmailEvent(rawBody: string): AgentmailEvent | null {
  try {
    const parsed: unknown = JSON.parse(rawBody);
    return isAgentmailEvent(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** "Jane Doe <jane@example.com>" → "jane@example.com"; bare addresses pass. */
export function addressOf(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim().toLowerCase();
}

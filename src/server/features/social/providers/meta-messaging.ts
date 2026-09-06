/**
 * Instagram and Messenger through the Meta Graph API.
 *
 * Both platforms deliver to one webhook on the app and send through the
 * Page, so the only real difference is the `object` on the payload and which
 * field carries the person's name. Kept to plain fetch, like the WhatsApp
 * provider, because the runtime is workerd.
 */

const GRAPH_URL = "https://graph.facebook.com/v21.0";

export type SocialPlatform = "instagram" | "messenger";

export type InboundSocialMessage = {
  externalMessageId: string;
  participantId: string;
  text: string | null;
  attachmentUrl: string | null;
  occurredAt: string;
  /** True when the page itself sent it — an echo of our own reply. */
  isEcho: boolean;
};

type SocialDelivery = {
  platform: SocialPlatform;
  /** The Instagram account id or Page id the message was addressed to. */
  accountExternalId: string;
  messages: InboundSocialMessage[];
};

export class MetaMessagingError extends Error {
  constructor(
    readonly status: number,
    detail?: string,
  ) {
    super(`Meta returned ${status}${detail ? `: ${detail}` : ""}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/** The first attachment Meta gives a URL for; a sticker or story has one. */
function firstAttachmentUrl(message: Record<string, unknown>): string | null {
  const attachments = message.attachments;
  if (!Array.isArray(attachments)) return null;
  for (const attachment of attachments) {
    if (!isRecord(attachment)) continue;
    const payload = attachment.payload;
    if (isRecord(payload)) {
      const url = asString(payload.url);
      if (url) return url;
    }
  }
  return null;
}

/**
 * Read one webhook body. Anything unrecognised yields no messages rather
 * than an error: Meta sends read receipts, reactions and delivery notices
 * down the same pipe, and none of them belong in an inbox.
 */
export function parseMetaMessagingPayload(rawBody: string): SocialDelivery[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return [];
  }
  if (!isRecord(parsed)) return [];
  const object = asString(parsed.object);
  const platform: SocialPlatform | null =
    object === "instagram"
      ? "instagram"
      : object === "page"
        ? "messenger"
        : null;
  if (!platform || !Array.isArray(parsed.entry)) return [];

  const deliveries: SocialDelivery[] = [];
  for (const entry of parsed.entry) {
    if (!isRecord(entry)) continue;
    const accountExternalId = asString(entry.id);
    if (!accountExternalId || !Array.isArray(entry.messaging)) continue;
    const messages: InboundSocialMessage[] = [];
    for (const event of entry.messaging) {
      if (!isRecord(event)) continue;
      const message = event.message;
      if (!isRecord(message)) continue;
      const externalMessageId = asString(message.mid);
      const sender = isRecord(event.sender) ? asString(event.sender.id) : null;
      if (!externalMessageId || !sender) continue;
      const timestamp =
        typeof event.timestamp === "number" ? event.timestamp : Date.now();
      messages.push({
        externalMessageId,
        participantId: sender,
        text: asString(message.text),
        attachmentUrl: firstAttachmentUrl(message),
        occurredAt: new Date(timestamp).toISOString(),
        isEcho: message.is_echo === true,
      });
    }
    if (messages.length)
      deliveries.push({ platform, accountExternalId, messages });
  }
  return deliveries;
}

async function call(
  url: string,
  token: string,
  body: unknown,
  fetcher: typeof fetch,
): Promise<Record<string, unknown>> {
  const response = await fetcher(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  if (!response.ok) {
    let detail = text.slice(0, 200);
    try {
      const parsed: unknown = JSON.parse(text);
      if (isRecord(parsed) && isRecord(parsed.error)) {
        detail = asString(parsed.error.message) ?? detail;
      }
    } catch {
      // keep the raw excerpt
    }
    throw new MetaMessagingError(response.status, detail);
  }
  const parsed: unknown = text ? JSON.parse(text) : {};
  return isRecord(parsed) ? parsed : {};
}

/**
 * Send a reply. Meta only allows a free-form reply within 24 hours of the
 * person's last message; after that it needs a message tag we do not use, so
 * a late reply is refused by Meta rather than silently dropped here.
 */
export async function sendSocialMessage(input: {
  pageId: string;
  token: string;
  recipientId: string;
  text: string;
  fetcher?: typeof fetch;
}): Promise<{ externalMessageId: string | null }> {
  const result = await call(
    `${GRAPH_URL}/${encodeURIComponent(input.pageId)}/messages`,
    input.token,
    {
      recipient: { id: input.recipientId },
      message: { text: input.text },
      messaging_type: "RESPONSE",
    },
    input.fetcher ?? fetch,
  );
  return { externalMessageId: asString(result.message_id) };
}

/** The person's display name, so an inbox row is not just an opaque id. */
export async function fetchParticipantName(input: {
  participantId: string;
  token: string;
  platform: SocialPlatform;
  fetcher?: typeof fetch;
}): Promise<string | null> {
  // Instagram usually answers with a handle and Messenger with a display
  // name, but an Instagram profile without a public handle still has a name,
  // so ask for both and take whichever came back.
  const fields = input.platform === "instagram" ? "username,name" : "name";
  const fetcher = input.fetcher ?? fetch;
  const response = await fetcher(
    `${GRAPH_URL}/${encodeURIComponent(input.participantId)}?fields=${fields}`,
    {
      headers: { authorization: `Bearer ${input.token}` },
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) return null;
  const parsed: unknown = await response.json().catch(() => null);
  if (!isRecord(parsed)) return null;
  return input.platform === "instagram"
    ? (asString(parsed.username) ?? asString(parsed.name))
    : asString(parsed.name);
}

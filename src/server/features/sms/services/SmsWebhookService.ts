import { optOutChange } from "@/server/features/communications/outreachRules";
import { verifyTwilioSignature } from "@/server/features/communications/providers/signatures";
import { normalisePhone } from "@/server/features/voice-calls/elevenlabsWebhook";
import { decryptCredentials } from "@/server/lib/connection-secrets";
import { readTwilioSms } from "../providers/twilioSms";
import { SmsRepository as Repo } from "../repositories/SmsRepository";

type WebhookResult = { status: number; body: string };

/**
 * Twilio posts here for a text in and for each delivery update of one we
 * sent. The connection id in the URL picks the business and its Auth Token;
 * nothing is stored until Twilio's signature checks out against it.
 */
async function processTwilioSms(
  connectionId: string,
  url: string,
  headers: Headers,
  rawBody: string,
): Promise<WebhookResult> {
  const connection = await Repo.getConnectionById(connectionId);
  if (!connection) return { status: 404, body: "unknown connection" };
  const credentials = await decryptCredentials(connection.credentials);
  const authToken = credentials.AUTH_TOKEN;
  if (!authToken) return { status: 410, body: "connection has no auth token" };
  const params = Object.fromEntries(new URLSearchParams(rawBody));
  const valid = await verifyTwilioSignature(
    url,
    params,
    headers.get("x-twilio-signature"),
    authToken,
  );
  if (!valid) return { status: 401, body: "bad signature" };

  const event = readTwilioSms(params);
  if (!event) return { status: 200, body: "ignored" };
  const organizationId = connection.organizationId;
  if (event.kind === "status") {
    await Repo.updateStatusByExternalId(
      organizationId,
      event.sid,
      event.status,
      event.error,
    );
    return { status: 200, body: "status" };
  }

  const phone = normalisePhone(event.from) ?? event.from;
  const contact = await Repo.findContactByPhone(organizationId, phone);
  const conversation =
    (await Repo.findConversation(connection.id, phone)) ??
    (await Repo.createConversation({
      organizationId,
      connectionId: connection.id,
      phone,
      contactId: contact?.id ?? null,
    }));
  if (!conversation) return { status: 500, body: "conversation not saved" };
  const receivedAt = new Date().toISOString();
  const stored = await Repo.insertMessage({
    organizationId,
    conversationId: conversation.id,
    externalMessageId: event.sid,
    direction: "inbound",
    body:
      event.media > 0
        ? `${event.body}${event.body ? "\n" : ""}[${event.media} photo(s) attached — view in Twilio]`
        : event.body,
    status: "received",
    authoredBy: null,
    occurredAt: receivedAt,
  });
  if (!stored) return { status: 200, body: "duplicate" };
  const optOut = optOutChange(event.body);
  await Repo.updateConversation(organizationId, conversation.id, {
    lastInboundAt: receivedAt,
    lastMessageAt: receivedAt,
    status: "open",
    ...(conversation.contactId || !contact ? {} : { contactId: contact.id }),
    ...(optOut ? { optedOutAt: optOut === "out" ? receivedAt : null } : {}),
  });
  return { status: 200, body: "stored" };
}

export const SmsWebhookService = { processTwilioSms };

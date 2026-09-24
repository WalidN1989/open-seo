import { decryptCredentials } from "@/server/lib/connection-secrets";
import {
  addressOf,
  parseAgentmailEvent,
  verifyAgentmailSignature,
  type AgentmailMessage,
  type AgentmailThread,
} from "../providers/agentmail";
import {
  EmailRepository as Repo,
  type EmailAccountRow,
} from "../repositories/EmailRepository";
import { EmailAssistantService } from "./EmailAssistantService";

async function ingestReceived(
  account: EmailAccountRow,
  message: AgentmailMessage,
  thread: AgentmailThread | undefined,
) {
  // The webhook is scoped to this inbox; a delivery for another inbox is a
  // misconfiguration upstream and must not land in this business's mail.
  if (
    account.inboxId &&
    message.inbox_id.toLowerCase() !== account.inboxId.toLowerCase()
  ) {
    return null;
  }
  if (addressOf(message.from) === account.address.toLowerCase()) return null;
  if (await Repo.findMessageByExternalId(account.id, message.message_id))
    return null;
  const threadRow = await Repo.upsertThread(account, {
    externalThreadId: message.thread_id,
    subject: thread?.subject ?? message.subject ?? null,
    preview:
      thread?.preview ?? message.preview ?? message.text?.slice(0, 160) ?? null,
    senders: thread?.senders ?? [message.from],
    recipients: thread?.recipients ?? message.to ?? [],
    messageCount: thread?.message_count ?? null,
    lastMessageAt: message.timestamp,
    lastDirection: "inbound",
  });
  const inbound = await Repo.insertMessage({
    organizationId: account.organizationId,
    accountId: account.id,
    threadId: threadRow.id,
    externalMessageId: message.message_id,
    direction: "inbound",
    fromAddress: message.from,
    toAddresses: message.to ?? [],
    ccAddresses: message.cc ?? [],
    subject: message.subject ?? null,
    textBody: message.text ?? message.preview ?? null,
    htmlBody: message.html?.slice(0, 200_000) ?? null,
    status: "received",
    authoredBy: null,
    occurredAt: message.timestamp,
  });
  return { threadRow, inbound };
}

const DELIVERY_STATUS: Record<string, string> = {
  "message.sent": "sent",
  "message.delivered": "delivered",
  "message.bounced": "bounced",
  "message.complained": "complained",
  "message.rejected": "rejected",
};

async function processWebhook(
  accountId: string,
  headers: Headers,
  rawBody: string,
): Promise<{ status: number; body: string }> {
  const account = await Repo.getAccountById(accountId);
  if (!account || account.status !== "connected") {
    return { status: 404, body: "unknown account" };
  }
  const creds = await decryptCredentials(account.credentials);
  const secret = creds.WEBHOOK_SECRET;
  if (!secret) return { status: 410, body: "account has no webhook secret" };
  if (!(await verifyAgentmailSignature({ secret, headers, rawBody }))) {
    return { status: 401, body: "bad signature" };
  }
  const event = parseAgentmailEvent(rawBody);
  if (!event) return { status: 400, body: "unreadable event" };

  if (event.event_type === "message.received" && "message" in event) {
    const ingested = await ingestReceived(account, event.message, event.thread);
    if (ingested) {
      try {
        await EmailAssistantService.onInbound(
          account,
          ingested.threadRow,
          ingested.inbound,
          [],
        );
      } catch (error) {
        console.error(
          "Email assistant failed; message kept for a person",
          error,
        );
      }
    }
    return { status: 200, body: "ok" };
  }
  const status = DELIVERY_STATUS[event.event_type];
  const ref =
    ("send" in event && event.send) ||
    ("bounce" in event && event.bounce) ||
    ("complaint" in event && event.complaint) ||
    ("reject" in event && event.reject) ||
    null;
  if (status && ref?.message_id) {
    await Repo.setMessageStatusByExternalId(account.id, ref.message_id, status);
  }
  return { status: 200, body: "ok" };
}

export const EmailWebhookService = { processWebhook };

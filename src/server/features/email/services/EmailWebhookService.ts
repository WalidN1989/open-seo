import { decryptCredentials } from "@/server/lib/connection-secrets";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { CommunicationsRepository } from "@/server/features/communications/repositories/CommunicationsRepository";
import { WhatsappAssistantRepository } from "@/server/features/communications/repositories/WhatsappAssistantRepository";
import {
  WhatsappAssistantService,
  resolveAiKey,
} from "@/server/features/communications/services/WhatsappAssistantService";
import {
  businessContext,
  lookupProducts,
} from "@/server/features/communications/services/WhatsappAssistantReplyService";
import { generateWhatsappAiReply } from "@/server/features/communications/providers/whatsapp-ai";
import {
  addressOf,
  agentmailClient,
  parseAgentmailEvent,
  verifyAgentmailSignature,
  type AgentmailMessage,
  type AgentmailThread,
} from "../providers/agentmail";
import {
  EmailRepository as Repo,
  type EmailAccountRow,
  type EmailMessageRow,
  type EmailThreadRow,
} from "../repositories/EmailRepository";
import { recordOutbound } from "./EmailService";

const ASSISTANT = "assistant";

/**
 * Let the shared assistant answer an inbound email. It reads the same
 * settings, facts, prices and product lookup as WhatsApp — nothing is
 * duplicated — but writes a draft unless this account is on autopilot.
 */
async function replyWithAssistant(
  account: EmailAccountRow,
  threadRow: EmailThreadRow,
  inbound: EmailMessageRow,
) {
  const organizationId = account.organizationId;
  const aiConnection = await CommunicationsRepository.getIntegrationByProvider(
    organizationId,
    "claude_haiku",
  );
  if (aiConnection?.status !== "connected") return;
  const settings = WhatsappAssistantService.withDefaults(
    await WhatsappAssistantRepository.getSettings(organizationId),
  );
  const [history, context, apiKey] = await Promise.all([
    Repo.listMessages(organizationId, threadRow.id),
    businessContext(organizationId, settings),
    resolveAiKey(aiConnection),
  ]);
  const result = await generateWhatsappAiReply({
    history: history
      .filter((message) => message.direction !== "draft")
      .map((message) => ({
        direction: message.direction === "inbound" ? "inbound" : "outbound",
        body: message.textBody,
      })),
    apiKey,
    model: settings.model ?? (await getOptionalEnvValue("WHATSAPP_AI_MODEL")),
    businessContext: `${context}\n\n## Channel\nThis is an email, not a chat. Write a complete reply: a greeting, the answer, and a short sign-off with the business name. Plain text only, no markdown.`,
    persona: settings.persona,
    lookupProducts: (query) => lookupProducts(organizationId, query),
  });
  if (!result?.reply) return;
  if (account.autopilot) {
    const creds = await decryptCredentials(account.credentials);
    if (!creds.API_KEY || !account.inboxId || !inbound.externalMessageId)
      return;
    const sent = await agentmailClient(creds.API_KEY).replyToMessage(
      account.inboxId,
      inbound.externalMessageId,
      { text: result.reply },
    );
    await recordOutbound(account, threadRow, sent, {
      to: [inbound.fromAddress],
      subject: inbound.subject,
      text: result.reply,
      authoredBy: ASSISTANT,
    });
    return;
  }
  await Repo.insertMessage({
    organizationId,
    accountId: account.id,
    threadId: threadRow.id,
    externalMessageId: null,
    direction: "draft",
    fromAddress: account.address,
    toAddresses: [inbound.fromAddress],
    subject: inbound.subject,
    textBody: result.reply,
    htmlBody: null,
    status: "draft",
    authoredBy: ASSISTANT,
    occurredAt: new Date().toISOString(),
  });
  await Repo.setThreadStatus(organizationId, threadRow.id, "pending");
}

async function ingestReceived(
  account: EmailAccountRow,
  message: AgentmailMessage,
  thread: AgentmailThread | undefined,
) {
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
  });
  const inbound = await Repo.insertMessage({
    organizationId: account.organizationId,
    accountId: account.id,
    threadId: threadRow.id,
    externalMessageId: message.message_id,
    direction: "inbound",
    fromAddress: message.from,
    toAddresses: message.to ?? [],
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
        await replyWithAssistant(account, ingested.threadRow, ingested.inbound);
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

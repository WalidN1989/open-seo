import { decryptCredentials } from "@/server/lib/connection-secrets";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { verifyMetaSignature } from "@/server/features/communications/providers/signatures";
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
import { toPlainText } from "@/server/features/communications/providers/assistant-knowledge";
import {
  fetchParticipantName,
  parseMetaMessagingPayload,
  sendSocialMessage,
  type InboundSocialMessage,
  type SocialPlatform,
} from "../providers/meta-messaging";
import {
  SocialRepository as Repo,
  type SocialAccountRow,
  type SocialConversationRow,
} from "../repositories/SocialRepository";
import { recordOutbound, sendableAccount } from "./SocialService";

const ASSISTANT = "assistant";

/**
 * Meta verifies a webhook once, with a token the operator chose. Any
 * connected account whose stored token matches answers the challenge; there
 * is one webhook for the whole app, so it cannot be tied to one account.
 */
async function verifyChallenge(
  mode: string | null,
  token: string | null,
  challenge: string | null,
): Promise<string | null> {
  if (mode !== "subscribe" || !token || !challenge) return null;
  const accounts = await Repo.listAllConnected();
  for (const account of accounts) {
    const secrets = await decryptCredentials(account.credentials);
    if (secrets.VERIFY_TOKEN && secrets.VERIFY_TOKEN === token)
      return challenge;
  }
  const fallback = await getOptionalEnvValue("META_VERIFY_TOKEN");
  return fallback && fallback === token ? challenge : null;
}

/** Let the shared assistant answer, as a draft unless this account is live. */
async function replyWithAssistant(
  account: SocialAccountRow,
  conversation: SocialConversationRow,
  inbound: { body: string | null },
  platform: SocialPlatform,
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
    Repo.listMessages(organizationId, conversation.id),
    businessContext(organizationId, settings),
    resolveAiKey(aiConnection),
  ]);
  const channelNote =
    platform === "instagram"
      ? "This is an Instagram direct message. Keep it short and friendly, as a reply in a DM; no markdown and no formatting marks."
      : "This is a Facebook Messenger conversation. Keep it short and friendly; no markdown and no formatting marks.";
  const result = await generateWhatsappAiReply({
    history: history
      .filter((message) => message.direction !== "draft")
      .map((message) => ({
        direction: message.direction === "inbound" ? "inbound" : "outbound",
        body: message.body,
      })),
    apiKey,
    model: settings.model ?? (await getOptionalEnvValue("WHATSAPP_AI_MODEL")),
    businessContext: `${context}\n\n## Channel\n${channelNote}`,
    persona: settings.persona,
    lookupProducts: (query) => lookupProducts(organizationId, query),
  });
  if (!result?.reply) return;
  // Neither platform renders markdown; asterisks would reach the reader.
  const body = toPlainText(result.reply);

  if (account.autopilot) {
    const { token, pageId } = await sendableAccount(account);
    const sent = await sendSocialMessage({
      pageId,
      token,
      recipientId: conversation.participantId,
      text: body,
    });
    await recordOutbound(account, conversation, {
      externalMessageId: sent.externalMessageId,
      text: body,
      authoredBy: ASSISTANT,
    });
    return;
  }
  await Repo.insertMessage({
    organizationId,
    accountId: account.id,
    conversationId: conversation.id,
    externalMessageId: null,
    direction: "draft",
    body,
    attachmentUrl: null,
    status: "draft",
    authoredBy: ASSISTANT,
    occurredAt: new Date().toISOString(),
  });
  await Repo.setConversationStatus(organizationId, conversation.id, "pending");
}

async function ingest(
  account: SocialAccountRow,
  message: InboundSocialMessage,
  platform: SocialPlatform,
) {
  // The page's own messages echo back through the same webhook; recording
  // one as inbound would have the assistant answer itself.
  if (message.isEcho) return null;
  if (
    await Repo.findMessageByExternalId(account.id, message.externalMessageId)
  ) {
    return null;
  }
  const existing = await Repo.getConversationByParticipant(
    account.id,
    message.participantId,
  );
  let participantName = existing?.participantName ?? null;
  if (!participantName) {
    const secrets = await decryptCredentials(account.credentials);
    participantName = secrets.PAGE_ACCESS_TOKEN
      ? await fetchParticipantName({
          participantId: message.participantId,
          token: secrets.PAGE_ACCESS_TOKEN,
          platform,
        }).catch(() => null)
      : null;
  }
  const conversation = await Repo.upsertConversation(account, {
    participantId: message.participantId,
    participantName,
    preview: message.text?.slice(0, 160) ?? "(attachment)",
    lastMessageAt: message.occurredAt,
  });
  await Repo.insertMessage({
    organizationId: account.organizationId,
    accountId: account.id,
    conversationId: conversation.id,
    externalMessageId: message.externalMessageId,
    direction: "inbound",
    body: message.text,
    attachmentUrl: message.attachmentUrl,
    status: "received",
    authoredBy: null,
    occurredAt: message.occurredAt,
  });
  return conversation;
}

/**
 * One webhook serves every account on the app, so each delivery is routed by
 * the account id Meta addressed it to, and its signature is checked against
 * that account's own app secret.
 */
async function processWebhook(
  headers: Headers,
  rawBody: string,
): Promise<{ status: number; body: string }> {
  const deliveries = parseMetaMessagingPayload(rawBody);
  if (!deliveries.length) return { status: 200, body: "ok" };
  const signature = headers.get("x-hub-signature-256");

  for (const delivery of deliveries) {
    const account = await Repo.findAccountByExternalId(
      delivery.platform,
      delivery.accountExternalId,
    );
    if (!account || account.status !== "connected") continue;
    const secrets = await decryptCredentials(account.credentials);
    const appSecret = secrets.APP_SECRET;
    if (!appSecret) continue;
    if (!(await verifyMetaSignature(rawBody, signature, appSecret))) {
      return { status: 401, body: "bad signature" };
    }
    for (const message of delivery.messages) {
      const conversation = await ingest(account, message, delivery.platform);
      if (!conversation) continue;
      try {
        await replyWithAssistant(
          account,
          conversation,
          { body: message.text },
          delivery.platform,
        );
      } catch (error) {
        console.error(
          "Social assistant failed; message kept for a person",
          error,
        );
      }
    }
  }
  return { status: 200, body: "ok" };
}

export const SocialWebhookService = { verifyChallenge, processWebhook };

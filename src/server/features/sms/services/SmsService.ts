import { BusinessAuditRepository } from "@/server/features/business-modules/repositories/BusinessAuditRepository";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { outreachDecision } from "@/server/features/communications/outreachRules";
import { WhatsappAssistantRepository } from "@/server/features/communications/repositories/WhatsappAssistantRepository";
import { normalisePhone } from "@/server/features/voice-calls/elevenlabsWebhook";
import { decryptCredentials } from "@/server/lib/connection-secrets";
import { AppError } from "@/server/lib/errors";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { sendTwilioSms } from "../providers/twilioSms";
import {
  SmsRepository as Repo,
  type SmsConversationRow,
} from "../repositories/SmsRepository";

const MODULE = "sms" as const;

/**
 * The SMS module: a shared inbox of texts to and from the business's number,
 * each conversation tied to its CRM contact. Every read and send is checked
 * against the workspace's SMS entitlement and the member's permission, so a
 * business sees only its own texts.
 */

function nameOf(row: { firstName: string | null; lastName: string | null }) {
  return [row.firstName, row.lastName].filter(Boolean).join(" ") || null;
}

async function workspace(organizationId: string, userId: string) {
  await BusinessModuleService.requireAccess(organizationId, userId, MODULE);
  const [connections, conversations] = await Promise.all([
    Repo.listConnections(organizationId),
    Repo.listConversations(organizationId),
  ]);
  const numbers = await Promise.all(
    connections.map(async (connection) => {
      const credentials = await decryptCredentials(connection.credentials);
      return {
        id: connection.id,
        number: credentials.PHONE_NUMBER ?? null,
        status: connection.status,
      };
    }),
  );
  return {
    numbers,
    conversations: conversations.map((row) => ({
      id: row.conversation.id,
      phone: row.conversation.phone,
      name: nameOf(row),
      contactId: row.conversation.contactId,
      status: row.conversation.status,
      optedOut: Boolean(row.conversation.optedOutAt),
      lastMessageAt: row.conversation.lastMessageAt,
      lastInboundAt: row.conversation.lastInboundAt,
      lastOutboundAt: row.conversation.lastOutboundAt,
    })),
  };
}

async function thread(
  organizationId: string,
  userId: string,
  conversationId: string,
) {
  await BusinessModuleService.requireAccess(organizationId, userId, MODULE);
  const conversation = await Repo.getConversation(
    organizationId,
    conversationId,
  );
  if (!conversation)
    throw new AppError("NOT_FOUND", "SMS conversation not found.");
  const messages = await Repo.listMessages(organizationId, conversation.id);
  return {
    conversation: {
      id: conversation.id,
      phone: conversation.phone,
      contactId: conversation.contactId,
      optedOut: Boolean(conversation.optedOutAt),
      lastInboundAt: conversation.lastInboundAt,
      lastOutboundAt: conversation.lastOutboundAt,
    },
    messages: messages.map((message) => ({
      id: message.id,
      direction: message.direction,
      body: message.body,
      status: message.status,
      errorMessage: message.errorMessage,
      authoredBy: message.authoredBy,
      occurredAt: message.occurredAt,
    })),
  };
}

/** An existing conversation, or a new one with this number on the first line. */
async function conversationFor(
  organizationId: string,
  input: { conversationId?: string | null; to?: string | null },
): Promise<SmsConversationRow> {
  if (input.conversationId) {
    const found = await Repo.getConversation(
      organizationId,
      input.conversationId,
    );
    if (!found) throw new AppError("NOT_FOUND", "SMS conversation not found.");
    return found;
  }
  const phone = normalisePhone(input.to ?? "");
  if (!phone) {
    throw new AppError("VALIDATION_ERROR", "Enter a mobile number to text.");
  }
  const [connection] = await Repo.listConnections(organizationId);
  if (!connection) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Connect a Twilio SMS number in Integrations first.",
    );
  }
  const existing = await Repo.findConversation(connection.id, phone);
  if (existing) return existing;
  const contact = await Repo.findContactByPhone(organizationId, phone);
  const created = await Repo.createConversation({
    organizationId,
    connectionId: connection.id,
    phone,
    contactId: contact?.id ?? null,
  });
  if (!created) throw new Error("The SMS conversation could not be started.");
  return created;
}

async function deliver(
  organizationId: string,
  conversation: SmsConversationRow,
  body: string,
  authoredBy: string,
) {
  if (conversation.optedOutAt) {
    throw new AppError(
      "VALIDATION_ERROR",
      "This number replied STOP. Texts to it are blocked.",
    );
  }
  const connection = await Repo.getConnectionById(conversation.connectionId);
  if (!connection || connection.organizationId !== organizationId) {
    throw new AppError("NOT_FOUND", "SMS number not found.");
  }
  const credentials = await decryptCredentials(connection.credentials);
  const accountSid = credentials.ACCOUNT_SID;
  const authToken = credentials.AUTH_TOKEN;
  const from = credentials.PHONE_NUMBER;
  if (!accountSid || !authToken || !from) {
    throw new AppError(
      "VALIDATION_ERROR",
      "The Twilio SMS connection is missing its Account SID, Auth Token or number.",
    );
  }
  const occurredAt = new Date().toISOString();
  const queued = await Repo.insertMessage({
    organizationId,
    conversationId: conversation.id,
    externalMessageId: null,
    direction: "outbound",
    body,
    status: "queued",
    authoredBy,
    occurredAt,
  });
  if (!queued) throw new Error("The text could not be saved.");
  const appUrl = ((await getOptionalEnvValue("BETTER_AUTH_URL")) ?? "").replace(
    /\/+$/,
    "",
  );
  try {
    const sent = await sendTwilioSms({
      accountSid,
      authToken,
      from,
      to: conversation.phone,
      body,
      statusCallback: appUrl
        ? `${appUrl}/api/sms/twilio/${connection.id}`
        : null,
    });
    await Repo.updateMessage(organizationId, queued.id, {
      externalMessageId: sent.sid,
      status: sent.status,
    });
    await Repo.updateConversation(organizationId, conversation.id, {
      lastOutboundAt: occurredAt,
      lastMessageAt: occurredAt,
    });
    return {
      id: queued.id,
      status: sent.status,
      conversationId: conversation.id,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Sending failed.";
    await Repo.updateMessage(organizationId, queued.id, {
      status: "failed",
      errorMessage: reason.slice(0, 500),
    });
    throw new AppError("VALIDATION_ERROR", reason);
  }
}

/** A person texting from the inbox or a lead page. */
async function send(
  organizationId: string,
  userId: string,
  input: { conversationId?: string | null; to?: string | null; body: string },
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    MODULE,
    "manage",
  );
  const conversation = await conversationFor(organizationId, input);
  const result = await deliver(
    organizationId,
    conversation,
    input.body,
    userId,
  );
  await BusinessAuditRepository.record({
    organizationId,
    actorUserId: userId,
    action: "sms.message.sent",
    targetType: "sms_message",
    targetId: result.id,
    metadata: { conversationId: conversation.id },
  });
  return result;
}

/**
 * An agent texting on the business's behalf, in an existing conversation,
 * only when outreachDecision allows it: never after STOP, at most one
 * unanswered text a day, and unprompted texts in working hours.
 */
async function agentSend(
  organizationId: string,
  userId: string,
  input: { conversationId: string; body: string },
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    MODULE,
    "manage",
  );
  const conversation = await conversationFor(organizationId, input);
  const settings =
    await WhatsappAssistantRepository.getSettings(organizationId);
  const decision = outreachDecision(
    {
      optedOut: Boolean(conversation.optedOutAt),
      lastInboundAt: conversation.lastInboundAt,
      lastOutboundAt: conversation.lastOutboundAt,
    },
    {
      freeText: true,
      needsWindow: false,
      timeZone: settings?.timezone || "Australia/Brisbane",
    },
  );
  if (!decision.allowed)
    throw new AppError("VALIDATION_ERROR", decision.reason);
  const result = await deliver(
    organizationId,
    conversation,
    input.body,
    "agent:mcp",
  );
  await BusinessAuditRepository.record({
    organizationId,
    actorUserId: userId,
    action: "sms.message.sent_by_agent",
    targetType: "sms_message",
    targetId: result.id,
    metadata: { conversationId: conversation.id, prompted: decision.prompted },
  });
  return result;
}

export const SmsService = { workspace, thread, send, agentSend };

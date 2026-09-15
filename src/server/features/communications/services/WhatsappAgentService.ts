import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { AppError } from "@/server/lib/errors";
import { outreachDecision, type OutreachState } from "../outreachRules";
import { sendWhatsappTemplate } from "../providers/whatsapp";
import { CommunicationsRepository } from "../repositories/CommunicationsRepository";
import { WhatsappAgentRepository as Repo } from "../repositories/WhatsappAgentRepository";
import { WhatsappAssistantRepository } from "../repositories/WhatsappAssistantRepository";
import { CommunicationsService } from "./CommunicationsService";

const DEFAULT_ZONE = "Australia/Brisbane";
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * WhatsApp for an agent acting on the business's behalf. Every send passes
 * outreachDecision first, so the 24-hour window, opt-outs, one unanswered
 * follow-up a day and working hours hold whatever the agent was told.
 */

async function timeZoneOf(organizationId: string) {
  const settings =
    await WhatsappAssistantRepository.getSettings(organizationId);
  return settings?.timezone || DEFAULT_ZONE;
}

function stateOf(chat: {
  optedOutAt: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
}): OutreachState {
  return {
    optedOut: Boolean(chat.optedOutAt),
    lastInboundAt: chat.lastInboundAt,
    lastOutboundAt: chat.lastOutboundAt,
  };
}

async function listChats(organizationId: string, userId: string, limit = 30) {
  await BusinessModuleService.requireAccess(organizationId, userId, "whatsapp");
  const now = Date.now();
  const rows = await Repo.listChats(organizationId, limit);
  return rows.map((row) => ({
    id: row.id,
    phone: row.phone,
    name: [row.firstName, row.lastName].filter(Boolean).join(" ") || null,
    status: row.status,
    optedOut: Boolean(row.optedOutAt),
    lastMessageAt: row.lastMessageAt,
    lastInboundAt: row.lastInboundAt,
    lastOutboundAt: row.lastOutboundAt,
    windowOpen: Boolean(
      row.lastInboundAt && now - Date.parse(row.lastInboundAt) <= DAY_MS,
    ),
  }));
}

async function getChat(
  organizationId: string,
  userId: string,
  conversationId: string,
) {
  await BusinessModuleService.requireAccess(organizationId, userId, "whatsapp");
  const chat = await Repo.getChat(organizationId, conversationId);
  if (!chat) throw new AppError("NOT_FOUND", "WhatsApp chat not found.");
  const [messages, templates] = await Promise.all([
    Repo.listMessages(organizationId, conversationId),
    Repo.listApprovedTemplates(organizationId),
  ]);
  return { chat, messages, templates };
}

async function requireAllowed(
  organizationId: string,
  conversationId: string,
  freeText: boolean,
) {
  const chat = await Repo.getChat(organizationId, conversationId);
  if (!chat) throw new AppError("NOT_FOUND", "WhatsApp chat not found.");
  const decision = outreachDecision(stateOf(chat), {
    freeText,
    needsWindow: true,
    timeZone: await timeZoneOf(organizationId),
  });
  if (!decision.allowed)
    throw new AppError("VALIDATION_ERROR", decision.reason);
  return chat;
}

async function sendReply(
  organizationId: string,
  userId: string,
  input: { conversationId: string; body: string },
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "whatsapp",
    "manage",
  );
  await requireAllowed(organizationId, input.conversationId, true);
  return CommunicationsService.sendWhatsappMessage(organizationId, userId, {
    conversationId: input.conversationId,
    body: input.body,
  });
}

async function sendTemplate(
  organizationId: string,
  userId: string,
  input: {
    conversationId: string;
    templateId: string;
    variables?: Record<string, string>;
  },
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "whatsapp",
    "manage",
  );
  await requireAllowed(organizationId, input.conversationId, false);
  const template = (await Repo.listApprovedTemplates(organizationId)).find(
    (row) => row.id === input.templateId,
  );
  if (!template) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Only a template approved in this workspace can be sent.",
    );
  }
  const context = await CommunicationsRepository.getWhatsappConversationForSend(
    organizationId,
    input.conversationId,
  );
  const recipient = context?.conversation.externalConversationId;
  if (!context || !recipient) {
    throw new AppError("NOT_FOUND", "WhatsApp chat not found.");
  }
  const body = Object.entries(input.variables ?? {}).reduce(
    (text, [key, value]) => text.replaceAll(`{{${key}}}`, value),
    template.body,
  );
  const queued = await CommunicationsRepository.createQueuedWhatsappMessage(
    organizationId,
    input.conversationId,
    body,
  );
  try {
    const result = await sendWhatsappTemplate(context.connection, recipient, {
      name: template.name,
      languageCode: template.languageCode,
      externalTemplateId: template.externalTemplateId,
      variables: input.variables,
    });
    return CommunicationsRepository.completeWhatsappMessage(
      organizationId,
      queued.id,
      {
        externalMessageId: result.externalMessageId,
        status: result.status,
        sentAt: new Date().toISOString(),
      },
    );
  } catch (error) {
    await CommunicationsRepository.completeWhatsappMessage(
      organizationId,
      queued.id,
      { status: "failed" },
    );
    throw error;
  }
}

export const WhatsappAgentService = {
  listChats,
  getChat,
  sendReply,
  sendTemplate,
};

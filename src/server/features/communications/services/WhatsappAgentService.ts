import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { AppError } from "@/server/lib/errors";
import { evaluateWhatsappWindow } from "../whatsappWindow";
import { requireWhatsappSendAllowed as requireAllowed } from "./WhatsappSendPolicyService";
import { sendWhatsappTemplate } from "../providers/whatsapp";
import { CommunicationsRepository } from "../repositories/CommunicationsRepository";
import { WhatsappAgentRepository as Repo } from "../repositories/WhatsappAgentRepository";
import { CommunicationsService } from "./CommunicationsService";

async function listChats(organizationId: string, userId: string, limit = 30) {
  await BusinessModuleService.requireAccess(organizationId, userId, "whatsapp");
  const now = new Date();
  const rows = await Repo.listChats(organizationId, limit);
  return rows.map((row) => ({
    id: row.id,
    phone: row.phone,
    name: [row.firstName, row.lastName].filter(Boolean).join(" ") || null,
    status: row.status,
    replyMode: row.replyMode,
    optedOut: Boolean(row.optedOutAt),
    lastMessageAt: row.lastMessageAt,
    lastOutboundAt: row.lastOutboundAt,
    ...evaluateWhatsappWindow(row.lastInboundAt, now),
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
  return {
    chat: { ...chat, ...evaluateWhatsappWindow(chat.lastInboundAt) },
    messages,
    templates,
  };
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
  return CommunicationsService.sendWhatsappMessage(
    organizationId,
    userId,
    {
      conversationId: input.conversationId,
      body: input.body,
    },
    true,
  );
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
    await requireAllowed(organizationId, input.conversationId, false, {
      excludeOutboundMessageId: queued.id,
    });
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
  setChatMode: async (
    organizationId: string,
    userId: string,
    input: { conversationId: string; mode: "auto" | "manual" },
  ) => {
    const chat = await CommunicationsService.updateWhatsappConversation(
      organizationId,
      userId,
      { conversationId: input.conversationId, replyMode: input.mode },
    );
    return { conversationId: chat.id, replyMode: chat.replyMode };
  },
  requireAllowed,
  listChats,
  getChat,
  sendReply,
  sendTemplate,
};

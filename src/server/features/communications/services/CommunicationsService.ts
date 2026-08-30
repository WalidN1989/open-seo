import type { z } from "zod";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import type {
  createIntegrationSchema,
  createVoiceAgentSchema,
  createWhatsappConnectionSchema,
  createWhatsappTemplateSchema,
  sendWhatsappMessageSchema,
} from "@/types/schemas/communications";
import { CommunicationsRepository } from "../repositories/CommunicationsRepository";
import {
  parseMetaPayload,
  parseTwilioPayload,
  resolveCredential,
  sendWhatsappText,
} from "../providers/whatsapp";
import {
  verifyMetaSignature,
  verifyTwilioSignature,
} from "../providers/signatures";

async function whatsappWorkspace(organizationId: string, userId: string) {
  await BusinessModuleService.requireAccess(organizationId, userId, "whatsapp");
  return CommunicationsRepository.getWhatsappWorkspace(organizationId);
}
async function createWhatsappConnection(
  organizationId: string,
  userId: string,
  input: z.infer<typeof createWhatsappConnectionSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "whatsapp",
    "admin",
  );
  return CommunicationsRepository.createWhatsappConnection(
    organizationId,
    input,
  );
}
async function createWhatsappTemplate(
  organizationId: string,
  userId: string,
  input: z.infer<typeof createWhatsappTemplateSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "whatsapp",
    "manage",
  );
  return CommunicationsRepository.createWhatsappTemplate(organizationId, input);
}
async function voiceWorkspace(organizationId: string, userId: string) {
  await BusinessModuleService.requireAccess(organizationId, userId, "voice");
  return CommunicationsRepository.getVoiceWorkspace(organizationId);
}
async function createVoiceAgent(
  organizationId: string,
  userId: string,
  input: z.infer<typeof createVoiceAgentSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "voice",
    "admin",
  );
  return CommunicationsRepository.createVoiceAgent(organizationId, input);
}
async function integrationsWorkspace(organizationId: string, userId: string) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "integrations",
  );
  return CommunicationsRepository.getIntegrationsWorkspace(organizationId);
}
async function createIntegration(
  organizationId: string,
  userId: string,
  input: z.infer<typeof createIntegrationSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "integrations",
    "admin",
  );
  return CommunicationsRepository.createIntegration(organizationId, input);
}

async function processWhatsappWebhook(
  connectionId: string,
  requestUrl: string,
  headers: Headers,
  rawBody: string,
) {
  const connection =
    await CommunicationsRepository.getWhatsappConnectionById(connectionId);
  if (!connection) return { status: 404, body: "Connection not found" };

  let parsed;
  if (connection.provider === "twilio") {
    const params = Object.fromEntries(new URLSearchParams(rawBody));
    const authToken = await resolveCredential(connection, "AUTH_TOKEN");
    const valid = await verifyTwilioSignature(
      requestUrl,
      params,
      headers.get("x-twilio-signature"),
      authToken,
    );
    if (!valid) return { status: 401, body: "Invalid signature" };
    parsed = parseTwilioPayload(params);
  } else if (connection.provider === "meta_cloud") {
    const appSecret = await resolveCredential(connection, "APP_SECRET");
    const valid = await verifyMetaSignature(
      rawBody,
      headers.get("x-hub-signature-256"),
      appSecret,
    );
    if (!valid) return { status: 401, body: "Invalid signature" };
    parsed = parseMetaPayload(JSON.parse(rawBody));
  } else {
    return { status: 400, body: "Provider does not support webhooks" };
  }

  for (const message of parsed.messages) {
    await CommunicationsRepository.ingestWhatsappMessage(connection, message);
  }
  for (const update of parsed.statuses) {
    await CommunicationsRepository.updateWhatsappDelivery(connection, update);
  }
  await CommunicationsRepository.markWhatsappConnectionConnected(connection.id);
  return { status: 200, body: "ok" };
}

async function verifyMetaWebhook(
  connectionId: string,
  mode: string | null,
  token: string | null,
  challenge: string | null,
) {
  const connection =
    await CommunicationsRepository.getWhatsappConnectionById(connectionId);
  if (!connection || connection.provider !== "meta_cloud") return null;
  const expected = await resolveCredential(connection, "VERIFY_TOKEN");
  if (mode !== "subscribe" || token !== expected) return null;
  await CommunicationsRepository.markWhatsappConnectionConnected(connection.id);
  return challenge;
}

async function sendWhatsappMessage(
  organizationId: string,
  userId: string,
  input: z.infer<typeof sendWhatsappMessageSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "whatsapp",
    "manage",
  );
  const context = await CommunicationsRepository.getWhatsappConversationForSend(
    organizationId,
    input.conversationId,
  );
  if (!context?.conversation.externalConversationId) {
    throw new Error("WhatsApp conversation not found.");
  }
  const queued = await CommunicationsRepository.createQueuedWhatsappMessage(
    organizationId,
    context.conversation.id,
    input.body,
  );
  try {
    const result = await sendWhatsappText(
      context.connection,
      context.conversation.externalConversationId,
      input.body,
    );
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

export const CommunicationsService = {
  createIntegration,
  createVoiceAgent,
  createWhatsappConnection,
  createWhatsappTemplate,
  integrationsWorkspace,
  processWhatsappWebhook,
  sendWhatsappMessage,
  verifyMetaWebhook,
  voiceWorkspace,
  whatsappWorkspace,
};

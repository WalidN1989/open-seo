/* oxlint-disable max-lines */
import type { z } from "zod";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import type {
  createIntegrationSchema,
  createVoiceAgentSchema,
  appendVoiceTranscriptSchema,
  createWebhookEndpointSchema,
  createWhatsappConnectionSchema,
  createWhatsappAutomationSchema,
  createWhatsappCampaignSchema,
  createWhatsappOrderSchema,
  createWhatsappTemplateSchema,
  sendWhatsappMessageSchema,
  testWebhookEndpointSchema,
  retryWebhookDeliverySchema,
  startVoiceConversationSchema,
  synthesizeVoiceSpeechSchema,
  transcribeVoiceAudioSchema,
  endVoiceConversationSchema,
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
import { deliverWebhook, validateWebhookUrl } from "../providers/webhooks";
import { speakWithDeepgram, transcribeWithDeepgram } from "../providers/voice";

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

async function createWhatsappCampaign(
  organizationId: string,
  userId: string,
  input: z.infer<typeof createWhatsappCampaignSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "whatsapp",
    "manage",
  );
  const [connectionValid, templateValid] = await Promise.all([
    CommunicationsRepository.whatsappEntityBelongsToOrganization(
      organizationId,
      "connection",
      input.connectionId,
    ),
    CommunicationsRepository.whatsappEntityBelongsToOrganization(
      organizationId,
      "template",
      input.templateId,
    ),
  ]);
  if (!connectionValid || !templateValid) {
    throw new Error("WhatsApp connection or template not found.");
  }
  return CommunicationsRepository.createWhatsappCampaign(organizationId, input);
}

async function createWhatsappAutomation(
  organizationId: string,
  userId: string,
  input: z.infer<typeof createWhatsappAutomationSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "whatsapp",
    "manage",
  );
  const templateValid =
    await CommunicationsRepository.whatsappEntityBelongsToOrganization(
      organizationId,
      "template",
      input.responseTemplateId,
    );
  if (!templateValid) throw new Error("WhatsApp template not found.");
  return CommunicationsRepository.createWhatsappAutomation(
    organizationId,
    input,
  );
}

async function createWhatsappOrder(
  organizationId: string,
  userId: string,
  input: z.infer<typeof createWhatsappOrderSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "whatsapp",
    "manage",
  );
  const [conversationValid, contactValid] = await Promise.all([
    input.conversationId
      ? CommunicationsRepository.whatsappEntityBelongsToOrganization(
          organizationId,
          "conversation",
          input.conversationId,
        )
      : true,
    input.contactId
      ? CommunicationsRepository.whatsappEntityBelongsToOrganization(
          organizationId,
          "contact",
          input.contactId,
        )
      : true,
  ]);
  if (!conversationValid || !contactValid) {
    throw new Error("WhatsApp conversation or contact not found.");
  }
  const order = await CommunicationsRepository.createWhatsappOrder(
    organizationId,
    input,
  );
  await emitBusinessEvent(organizationId, "whatsapp.order.requested", {
    orderId: order.id,
    amountCents: order.amountCents,
  });
  return order;
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

async function startVoiceConversation(
  organizationId: string,
  userId: string,
  input: z.infer<typeof startVoiceConversationSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "voice",
    "manage",
  );
  const agent = await CommunicationsRepository.getVoiceAgent(
    organizationId,
    input.agentConfigId,
  );
  const contactValid = input.contactId
    ? await CommunicationsRepository.contactBelongsToOrganization(
        organizationId,
        input.contactId,
      )
    : true;
  if (!agent || !contactValid)
    throw new Error("Voice agent or contact not found.");
  const conversation = await CommunicationsRepository.startVoiceConversation(
    organizationId,
    input,
  );
  await emitBusinessEvent(organizationId, "voice.conversation.started", {
    conversationId: conversation.id,
    agentConfigId: conversation.agentConfigId,
  });
  return conversation;
}

async function appendVoiceTranscript(
  organizationId: string,
  userId: string,
  input: z.infer<typeof appendVoiceTranscriptSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "voice",
    "manage",
  );
  const conversation = await CommunicationsRepository.getVoiceConversation(
    organizationId,
    input.conversationId,
  );
  if (!conversation || conversation.status !== "active") {
    throw new Error("Active voice conversation not found.");
  }
  return CommunicationsRepository.appendVoiceTranscript(organizationId, input);
}

async function endVoiceConversation(
  organizationId: string,
  userId: string,
  input: z.infer<typeof endVoiceConversationSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "voice",
    "manage",
  );
  const existing = await CommunicationsRepository.getVoiceConversation(
    organizationId,
    input.conversationId,
  );
  if (!existing) throw new Error("Voice conversation not found.");
  const conversation = await CommunicationsRepository.endVoiceConversation(
    organizationId,
    input.conversationId,
  );
  await emitBusinessEvent(organizationId, "voice.conversation.completed", {
    conversationId: input.conversationId,
  });
  return conversation;
}

async function voiceSessionContext(
  organizationId: string,
  conversationId: string,
) {
  const conversation = await CommunicationsRepository.getVoiceConversation(
    organizationId,
    conversationId,
  );
  if (!conversation || conversation.status !== "active") {
    throw new Error("Active voice conversation not found.");
  }
  const agent = await CommunicationsRepository.getVoiceAgent(
    organizationId,
    conversation.agentConfigId,
  );
  if (!agent) throw new Error("Voice agent not found.");
  return { conversation, agent };
}

async function transcribeVoiceAudio(
  organizationId: string,
  userId: string,
  input: z.infer<typeof transcribeVoiceAudioSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "voice",
    "manage",
  );
  const { agent } = await voiceSessionContext(
    organizationId,
    input.conversationId,
  );
  if (agent.speechToTextProvider !== "deepgram") {
    throw new Error(
      "This voice agent is not configured for Deepgram transcription.",
    );
  }
  const result = await transcribeWithDeepgram(
    agent.credentialReference,
    input.audioBase64,
    input.mimeType,
    input.language,
  );
  await CommunicationsRepository.appendVoiceTranscript(organizationId, {
    conversationId: input.conversationId,
    speaker: "user",
    transcript: result.transcript,
  });
  return result;
}

async function synthesizeVoiceSpeech(
  organizationId: string,
  userId: string,
  input: z.infer<typeof synthesizeVoiceSpeechSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "voice",
    "manage",
  );
  const { agent } = await voiceSessionContext(
    organizationId,
    input.conversationId,
  );
  if (agent.textToSpeechProvider !== "deepgram") {
    throw new Error("This voice agent is not configured for Deepgram speech.");
  }
  const result = await speakWithDeepgram(
    agent.credentialReference,
    input.text,
    input.model,
  );
  await CommunicationsRepository.appendVoiceTranscript(organizationId, {
    conversationId: input.conversationId,
    speaker: "agent",
    transcript: input.text,
  });
  return result;
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

async function createWebhookEndpoint(
  organizationId: string,
  userId: string,
  input: z.infer<typeof createWebhookEndpointSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "integrations",
    "admin",
  );
  validateWebhookUrl(input.url);
  return CommunicationsRepository.createWebhookEndpoint(organizationId, input);
}

async function executeWebhookDelivery(
  organizationId: string,
  delivery: NonNullable<
    Awaited<ReturnType<typeof CommunicationsRepository.getWebhookDelivery>>
  >,
) {
  const endpoint = await CommunicationsRepository.getWebhookEndpoint(
    organizationId,
    delivery.endpointId,
  );
  if (!endpoint) throw new Error("Webhook endpoint not found.");
  const attemptCount = delivery.attemptCount + 1;
  const lastAttemptAt = new Date().toISOString();
  try {
    const result = await deliverWebhook(
      endpoint,
      delivery.eventType,
      delivery.payloadJson,
      delivery.id,
    );
    const failed = !result.ok;
    return CommunicationsRepository.updateWebhookDelivery(
      organizationId,
      delivery.id,
      {
        status: failed ? "failed" : "delivered",
        responseStatus: result.status,
        responseBody: result.responseBody,
        attemptCount,
        lastAttemptAt,
        nextAttemptAt: failed
          ? new Date(
              Date.now() + Math.min(3600, 2 ** attemptCount * 30) * 1000,
            ).toISOString()
          : null,
        errorMessage: failed ? `HTTP ${result.status}` : null,
      },
    );
  } catch (error) {
    await CommunicationsRepository.updateWebhookDelivery(
      organizationId,
      delivery.id,
      {
        status: "failed",
        attemptCount,
        lastAttemptAt,
        nextAttemptAt: new Date(
          Date.now() + Math.min(3600, 2 ** attemptCount * 30) * 1000,
        ).toISOString(),
        errorMessage:
          error instanceof Error
            ? error.message.slice(0, 500)
            : "Delivery failed",
      },
    );
    throw error;
  }
}

async function testWebhookEndpoint(
  organizationId: string,
  userId: string,
  input: z.infer<typeof testWebhookEndpointSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "integrations",
    "manage",
  );
  const endpoint = await CommunicationsRepository.getWebhookEndpoint(
    organizationId,
    input.endpointId,
  );
  if (!endpoint) throw new Error("Webhook endpoint not found.");
  const delivery = await CommunicationsRepository.createWebhookDelivery(
    organizationId,
    endpoint.id,
    input.eventType,
    JSON.stringify(input.payload),
  );
  return executeWebhookDelivery(organizationId, delivery);
}

async function retryWebhookDelivery(
  organizationId: string,
  userId: string,
  input: z.infer<typeof retryWebhookDeliverySchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "integrations",
    "manage",
  );
  const delivery = await CommunicationsRepository.getWebhookDelivery(
    organizationId,
    input.deliveryId,
  );
  if (!delivery) throw new Error("Webhook delivery not found.");
  return executeWebhookDelivery(organizationId, delivery);
}

async function emitBusinessEvent(
  organizationId: string,
  eventType: string,
  data: Record<string, unknown>,
) {
  const rows = await CommunicationsRepository.listWebhookEndpointsForEvent(
    organizationId,
    eventType,
  );
  const payloadJson = JSON.stringify({
    id: crypto.randomUUID(),
    type: eventType,
    createdAt: new Date().toISOString(),
    data,
  });
  for (const { endpoint } of rows) {
    const delivery = await CommunicationsRepository.createWebhookDelivery(
      organizationId,
      endpoint.id,
      eventType,
      payloadJson,
    );
    try {
      await executeWebhookDelivery(organizationId, delivery);
    } catch {
      // Delivery state contains the retry schedule. Customer endpoints must
      // never roll back the business mutation which produced this event.
    }
  }
}

export const CommunicationsService = {
  appendVoiceTranscript,
  createIntegration,
  createVoiceAgent,
  createWhatsappConnection,
  createWhatsappAutomation,
  createWhatsappCampaign,
  createWhatsappOrder,
  createWhatsappTemplate,
  createWebhookEndpoint,
  endVoiceConversation,
  emitBusinessEvent,
  integrationsWorkspace,
  processWhatsappWebhook,
  retryWebhookDelivery,
  sendWhatsappMessage,
  startVoiceConversation,
  synthesizeVoiceSpeech,
  testWebhookEndpoint,
  transcribeVoiceAudio,
  verifyMetaWebhook,
  voiceWorkspace,
  whatsappWorkspace,
};

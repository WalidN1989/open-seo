/* oxlint-disable max-lines, max-depth, max-params */
import type { z } from "zod";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
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
  testIntegrationSchema,
  retryWebhookDeliverySchema,
  startVoiceConversationSchema,
  transcribeVoiceAudioSchema,
  endVoiceConversationSchema,
  launchWhatsappCampaignSchema,
  updateWhatsappConversationSchema,
  runIntegrationActionSchema,
} from "@/types/schemas/communications";
import { CommunicationsRepository } from "../repositories/CommunicationsRepository";
import {
  parseMetaPayload,
  parseTwilioPayload,
  resolveCredential,
  sendWhatsappText,
  sendWhatsappTemplate,
} from "../providers/whatsapp";
import {
  verifyMetaSignature,
  verifyTwilioSignature,
} from "../providers/signatures";
import { deliverWebhook, validateWebhookUrl } from "../providers/webhooks";
import { speakWithDeepgram, transcribeWithDeepgram } from "../providers/voice";
import { generateWhatsappAiReply } from "../providers/whatsapp-ai";
import {
  runApifyActor,
  scrapeWithFirecrawl,
  testIntegrationConnection,
} from "../providers/integrations";
import { generateVoiceAgentReply } from "../providers/voice-ai";
import { BusinessAuditRepository } from "@/server/features/business-modules/repositories/BusinessAuditRepository";
import { BusinessModuleRepository } from "@/server/features/business-modules/repositories/BusinessModuleRepository";

async function auditMutation(
  organizationId: string,
  userId: string,
  action: string,
  targetType: string,
  targetId: string,
  metadata?: Record<string, unknown>,
) {
  await BusinessAuditRepository.record({
    organizationId,
    actorUserId: userId,
    action,
    targetType,
    targetId,
    metadata,
  });
}

async function whatsappWorkspace(organizationId: string, userId: string) {
  await BusinessModuleService.requireAccess(organizationId, userId, "whatsapp");
  const [workspace, members] = await Promise.all([
    CommunicationsRepository.getWhatsappWorkspace(organizationId),
    BusinessModuleRepository.listMembers(organizationId),
  ]);
  return { ...workspace, members };
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
  const connection = await CommunicationsRepository.createWhatsappConnection(
    organizationId,
    input,
  );
  await auditMutation(
    organizationId,
    userId,
    "whatsapp.connection.created",
    "whatsapp_connection",
    connection.id,
    { provider: connection.provider },
  );
  return connection;
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
  const template = await CommunicationsRepository.createWhatsappTemplate(
    organizationId,
    input,
  );
  await auditMutation(
    organizationId,
    userId,
    "whatsapp.template.created",
    "whatsapp_template",
    template.id,
    { status: template.status },
  );
  return template;
}

async function updateWhatsappConversation(
  organizationId: string,
  userId: string,
  input: z.infer<typeof updateWhatsappConversationSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "whatsapp",
    "manage",
  );
  const [contactValid, memberValid] = await Promise.all([
    input.contactId
      ? CommunicationsRepository.contactBelongsToOrganization(
          organizationId,
          input.contactId,
        )
      : true,
    input.assignedMemberId
      ? CommunicationsRepository.memberBelongsToOrganization(
          organizationId,
          input.assignedMemberId,
        )
      : true,
  ]);
  if (!contactValid || !memberValid)
    throw new Error("Contact or assignee not found.");
  const conversation =
    await CommunicationsRepository.updateWhatsappConversation(
      organizationId,
      input,
    );
  if (!conversation) throw new Error("WhatsApp conversation not found.");
  await BusinessAuditRepository.record({
    organizationId,
    actorUserId: userId,
    action: "whatsapp.conversation.updated",
    targetType: "whatsapp_conversation",
    targetId: conversation.id,
    metadata: {
      assignedMemberId: conversation.assignedMemberId,
      contactId: conversation.contactId,
      status: conversation.status,
    },
  });
  return conversation;
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
  const campaign = await CommunicationsRepository.createWhatsappCampaign(
    organizationId,
    input,
  );
  await auditMutation(
    organizationId,
    userId,
    "whatsapp.campaign.created",
    "whatsapp_campaign",
    campaign.id,
  );
  return campaign;
}

async function launchWhatsappCampaign(
  organizationId: string,
  userId: string,
  input: z.infer<typeof launchWhatsappCampaignSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "whatsapp",
    "manage",
  );
  const context = await CommunicationsRepository.getWhatsappCampaignContext(
    organizationId,
    input.campaignId,
  );
  if (!context) throw new Error("WhatsApp campaign not found.");
  if (
    context.campaign.status !== "draft" &&
    context.campaign.status !== "scheduled"
  ) {
    throw new Error("Only draft or scheduled campaigns can be launched.");
  }
  if (context.template.status !== "approved") {
    throw new Error("Campaigns require a provider-approved WhatsApp template.");
  }
  const startedAt = new Date().toISOString();
  await CommunicationsRepository.updateWhatsappCampaign(
    organizationId,
    context.campaign.id,
    { status: "running", startedAt },
  );
  let sent = 0;
  let failed = 0;
  for (const conversation of context.conversations) {
    if (!conversation.externalConversationId) continue;
    const queued = await CommunicationsRepository.createQueuedWhatsappMessage(
      organizationId,
      conversation.id,
      context.template.body,
    );
    try {
      const result = await sendWhatsappTemplate(
        context.connection,
        conversation.externalConversationId,
        context.template,
      );
      await CommunicationsRepository.completeWhatsappMessage(
        organizationId,
        queued.id,
        {
          externalMessageId: result.externalMessageId,
          status: result.status,
          sentAt: new Date().toISOString(),
        },
      );
      sent += 1;
    } catch {
      await CommunicationsRepository.completeWhatsappMessage(
        organizationId,
        queued.id,
        { status: "failed" },
      );
      failed += 1;
    }
  }
  await CommunicationsRepository.updateWhatsappCampaign(
    organizationId,
    context.campaign.id,
    {
      status: failed > 0 ? "completed_with_errors" : "completed",
      completedAt: new Date().toISOString(),
    },
  );
  await emitBusinessEvent(organizationId, "whatsapp.campaign.completed", {
    campaignId: context.campaign.id,
    sent,
    failed,
  });
  await auditMutation(
    organizationId,
    userId,
    "whatsapp.campaign.launched",
    "whatsapp_campaign",
    context.campaign.id,
    { sent, failed },
  );
  return { campaignId: context.campaign.id, sent, failed };
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
  const automation = await CommunicationsRepository.createWhatsappAutomation(
    organizationId,
    input,
  );
  await auditMutation(
    organizationId,
    userId,
    "whatsapp.automation.created",
    "whatsapp_automation",
    automation.id,
  );
  return automation;
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
  await auditMutation(
    organizationId,
    userId,
    "whatsapp.order.created",
    "whatsapp_order",
    order.id,
    { amountCents: order.amountCents },
  );
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
  const agent = await CommunicationsRepository.createVoiceAgent(
    organizationId,
    input,
  );
  await auditMutation(
    organizationId,
    userId,
    "voice.agent.created",
    "voice_agent",
    agent.id,
    { modelProvider: agent.modelProvider },
  );
  return agent;
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
  await auditMutation(
    organizationId,
    userId,
    "voice.conversation.started",
    "voice_conversation",
    conversation.id,
    { agentConfigId: conversation.agentConfigId },
  );
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
  await auditMutation(
    organizationId,
    userId,
    "voice.conversation.completed",
    "voice_conversation",
    input.conversationId,
  );
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
  if (
    agent.modelProvider === "anthropic" &&
    agent.textToSpeechProvider === "deepgram"
  ) {
    try {
      const history =
        await CommunicationsRepository.getVoiceConversationMessages(
          organizationId,
          input.conversationId,
        );
      const generated = await generateVoiceAgentReply({
        agentName: agent.name,
        credentialReference: agent.credentialReference,
        history,
      });
      const speech = await speakWithDeepgram(
        agent.credentialReference,
        generated.reply,
      );
      await CommunicationsRepository.appendVoiceTranscript(organizationId, {
        conversationId: input.conversationId,
        speaker: "agent",
        transcript: generated.reply,
      });
      return { ...result, ...speech, reply: generated.reply };
    } catch (error) {
      console.error("Voice agent response failed after transcription", error);
      return {
        ...result,
        replyError:
          error instanceof Error
            ? error.message
            : "The voice agent could not respond.",
      };
    }
  }
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
  const connection = await CommunicationsRepository.createIntegration(
    organizationId,
    input,
  );
  await auditMutation(
    organizationId,
    userId,
    "integration.created",
    "integration_connection",
    connection.id,
    { providerKey: connection.providerKey },
  );
  return connection;
}

async function testIntegration(
  organizationId: string,
  userId: string,
  input: z.infer<typeof testIntegrationSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "integrations",
    "manage",
  );
  const connection = await CommunicationsRepository.getIntegration(
    organizationId,
    input.connectionId,
  );
  if (!connection) throw new Error("Integration connection not found.");
  try {
    const result = await testIntegrationConnection(connection);
    await CommunicationsRepository.updateIntegrationStatus(
      organizationId,
      connection.id,
      "connected",
    );
    await BusinessAuditRepository.record({
      organizationId,
      actorUserId: userId,
      action: "integration.test.succeeded",
      targetType: "integration",
      targetId: connection.id,
      metadata: { providerKey: connection.providerKey },
    });
    return result;
  } catch (error) {
    await CommunicationsRepository.updateIntegrationStatus(
      organizationId,
      connection.id,
      "error",
    );
    await BusinessAuditRepository.record({
      organizationId,
      actorUserId: userId,
      action: "integration.test.failed",
      targetType: "integration",
      targetId: connection.id,
      metadata: { providerKey: connection.providerKey },
    });
    throw error;
  }
}

async function runIntegrationAction(
  organizationId: string,
  userId: string,
  input: z.infer<typeof runIntegrationActionSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "integrations",
    "manage",
  );
  const connection = await CommunicationsRepository.getIntegration(
    organizationId,
    input.connectionId,
  );
  if (!connection || connection.status !== "connected")
    throw new Error("Connect and test this provider before running actions.");
  const result =
    input.action === "apify_run_actor"
      ? await runApifyActor(connection, input)
      : await scrapeWithFirecrawl(connection, input);
  const resultPreview = JSON.stringify(result).slice(0, 50_000);
  await BusinessAuditRepository.record({
    organizationId,
    actorUserId: userId,
    action: `integration.${input.action}`,
    targetType: "integration_connection",
    targetId: connection.id,
    metadata:
      input.action === "apify_run_actor"
        ? { actorId: input.actorId }
        : { url: input.url },
  });
  return { action: input.action, resultPreview };
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
    const ingestion = await CommunicationsRepository.ingestWhatsappMessage(
      connection,
      message,
    );
    if (!ingestion.duplicate && ingestion.conversationId) {
      let handledByAi = false;
      const aiConnection =
        await CommunicationsRepository.getIntegrationByProvider(
          connection.organizationId,
          "claude_haiku",
        );
      if (aiConnection?.status === "connected") {
        try {
          const history =
            await CommunicationsRepository.getWhatsappConversationHistory(
              connection.organizationId,
              ingestion.conversationId,
            );
          const prefix = aiConnection.credentialReference?.trim();
          const result = await generateWhatsappAiReply({
            history,
            apiKey: prefix
              ? await getOptionalEnvValue(`${prefix}_API_KEY`)
              : null,
            model: await getOptionalEnvValue("WHATSAPP_AI_MODEL"),
          });
          if (result) {
            for (const action of result.actions) {
              if (action.name === "flag_for_team") {
                await CommunicationsRepository.flagWhatsappConversationForTeam(
                  connection.organizationId,
                  ingestion.conversationId,
                );
                continue;
              }
              if (action.name !== "create_order_request") continue;
              const rawAmount = Number(action.input.amount_cents || 0);
              await CommunicationsRepository.createWhatsappOrder(
                connection.organizationId,
                {
                  conversationId: ingestion.conversationId,
                  summary:
                    typeof action.input.summary === "string"
                      ? action.input.summary.slice(0, 2000)
                      : "Customer order enquiry",
                  amountCents:
                    Number.isSafeInteger(rawAmount) && rawAmount >= 0
                      ? rawAmount
                      : 0,
                },
              );
            }
            if (result.reply) {
              const queued =
                await CommunicationsRepository.createQueuedWhatsappMessage(
                  connection.organizationId,
                  ingestion.conversationId,
                  result.reply,
                );
              const sent = await sendWhatsappText(
                connection,
                message.sender,
                result.reply,
              );
              await CommunicationsRepository.completeWhatsappMessage(
                connection.organizationId,
                queued.id,
                {
                  externalMessageId: sent.externalMessageId,
                  status: sent.status,
                  sentAt: new Date().toISOString(),
                },
              );
              handledByAi = true;
            }
          }
        } catch (error) {
          console.error(
            "WhatsApp Claude assistant failed; using rule fallback",
            error,
          );
        }
      }
      if (handledByAi) continue;
      const rules =
        await CommunicationsRepository.listMatchingWhatsappAutomations(
          connection.organizationId,
          message.body,
          ingestion.isNew,
        );
      for (const rule of rules) {
        if (!rule.responseTemplateId) continue;
        const template = await CommunicationsRepository.getWhatsappTemplate(
          connection.organizationId,
          rule.responseTemplateId,
        );
        if (!template) continue;
        const queued =
          await CommunicationsRepository.createQueuedWhatsappMessage(
            connection.organizationId,
            ingestion.conversationId,
            template.body,
          );
        try {
          const result = await sendWhatsappText(
            connection,
            message.sender,
            template.body,
          );
          await CommunicationsRepository.completeWhatsappMessage(
            connection.organizationId,
            queued.id,
            {
              externalMessageId: result.externalMessageId,
              status: result.status,
              sentAt: new Date().toISOString(),
            },
          );
        } catch {
          await CommunicationsRepository.completeWhatsappMessage(
            connection.organizationId,
            queued.id,
            { status: "failed" },
          );
        }
      }
    }
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
    const message = await CommunicationsRepository.completeWhatsappMessage(
      organizationId,
      queued.id,
      {
        externalMessageId: result.externalMessageId,
        status: result.status,
        sentAt: new Date().toISOString(),
      },
    );
    await auditMutation(
      organizationId,
      userId,
      "whatsapp.message.sent",
      "whatsapp_message",
      queued.id,
      { conversationId: context.conversation.id },
    );
    return message;
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
  const endpoint = await CommunicationsRepository.createWebhookEndpoint(
    organizationId,
    input,
  );
  await auditMutation(
    organizationId,
    userId,
    "webhook.endpoint.created",
    "webhook_endpoint",
    endpoint.id,
    { eventTypes: input.eventTypes },
  );
  return endpoint;
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

// Every failed delivery already records when it should next be tried; until
// now nothing read that column back, so a failure waited for a human to press
// Retry. Runs unauthenticated by design — the scheduler acts for no tenant —
// which is why it re-reads each delivery's own organizationId rather than
// taking one from a caller.
async function retryDueWebhookDeliveries(limit = 25) {
  const due = await CommunicationsRepository.listDueWebhookDeliveries(
    new Date().toISOString(),
    limit,
  );
  let delivered = 0;
  let failed = 0;
  for (const delivery of due) {
    try {
      const result = await executeWebhookDelivery(
        delivery.organizationId,
        delivery,
      );
      if (result?.status === "delivered") delivered += 1;
      else failed += 1;
    } catch {
      // executeWebhookDelivery has already written the failure and the next
      // backoff; one bad endpoint must not stop the rest of the batch.
      failed += 1;
    }
  }
  return { considered: due.length, delivered, failed };
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
  launchWhatsappCampaign,
  processWhatsappWebhook,
  retryWebhookDelivery,
  retryDueWebhookDeliveries,
  runIntegrationAction,
  sendWhatsappMessage,
  startVoiceConversation,
  testWebhookEndpoint,
  testIntegration,
  transcribeVoiceAudio,
  updateWhatsappConversation,
  verifyMetaWebhook,
  voiceWorkspace,
  whatsappWorkspace,
};

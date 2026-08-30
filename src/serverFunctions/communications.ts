import { createServerFn } from "@tanstack/react-start";
import { CommunicationsService } from "@/server/features/communications/services/CommunicationsService";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";
import {
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
  synthesizeVoiceSpeechSchema,
  transcribeVoiceAudioSchema,
  endVoiceConversationSchema,
  launchWhatsappCampaignSchema,
} from "@/types/schemas/communications";

export const getWhatsappWorkspace = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) =>
    CommunicationsService.whatsappWorkspace(
      context.organizationId,
      context.userId,
    ),
  );
export const createWhatsappConnection = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(createWhatsappConnectionSchema)
  .handler(({ context, data }) =>
    CommunicationsService.createWhatsappConnection(
      context.organizationId,
      context.userId,
      data,
    ),
  );
export const createWhatsappTemplate = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(createWhatsappTemplateSchema)
  .handler(({ context, data }) =>
    CommunicationsService.createWhatsappTemplate(
      context.organizationId,
      context.userId,
      data,
    ),
  );
export const createWhatsappCampaign = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(createWhatsappCampaignSchema)
  .handler(({ context, data }) =>
    CommunicationsService.createWhatsappCampaign(
      context.organizationId,
      context.userId,
      data,
    ),
  );
export const launchWhatsappCampaign = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(launchWhatsappCampaignSchema)
  .handler(({ context, data }) =>
    CommunicationsService.launchWhatsappCampaign(
      context.organizationId,
      context.userId,
      data,
    ),
  );
export const createWhatsappAutomation = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(createWhatsappAutomationSchema)
  .handler(({ context, data }) =>
    CommunicationsService.createWhatsappAutomation(
      context.organizationId,
      context.userId,
      data,
    ),
  );
export const createWhatsappOrder = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(createWhatsappOrderSchema)
  .handler(({ context, data }) =>
    CommunicationsService.createWhatsappOrder(
      context.organizationId,
      context.userId,
      data,
    ),
  );
export const sendWhatsappMessage = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(sendWhatsappMessageSchema)
  .handler(({ context, data }) =>
    CommunicationsService.sendWhatsappMessage(
      context.organizationId,
      context.userId,
      data,
    ),
  );
export const getVoiceWorkspace = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) =>
    CommunicationsService.voiceWorkspace(
      context.organizationId,
      context.userId,
    ),
  );
export const createVoiceAgent = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(createVoiceAgentSchema)
  .handler(({ context, data }) =>
    CommunicationsService.createVoiceAgent(
      context.organizationId,
      context.userId,
      data,
    ),
  );
export const startVoiceConversation = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(startVoiceConversationSchema)
  .handler(({ context, data }) =>
    CommunicationsService.startVoiceConversation(
      context.organizationId,
      context.userId,
      data,
    ),
  );
export const appendVoiceTranscript = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(appendVoiceTranscriptSchema)
  .handler(({ context, data }) =>
    CommunicationsService.appendVoiceTranscript(
      context.organizationId,
      context.userId,
      data,
    ),
  );
export const endVoiceConversation = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(endVoiceConversationSchema)
  .handler(({ context, data }) =>
    CommunicationsService.endVoiceConversation(
      context.organizationId,
      context.userId,
      data,
    ),
  );
export const transcribeVoiceAudio = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(transcribeVoiceAudioSchema)
  .handler(({ context, data }) =>
    CommunicationsService.transcribeVoiceAudio(
      context.organizationId,
      context.userId,
      data,
    ),
  );
export const synthesizeVoiceSpeech = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(synthesizeVoiceSpeechSchema)
  .handler(({ context, data }) =>
    CommunicationsService.synthesizeVoiceSpeech(
      context.organizationId,
      context.userId,
      data,
    ),
  );
export const getIntegrationsWorkspace = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) =>
    CommunicationsService.integrationsWorkspace(
      context.organizationId,
      context.userId,
    ),
  );
export const createIntegration = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(createIntegrationSchema)
  .handler(({ context, data }) =>
    CommunicationsService.createIntegration(
      context.organizationId,
      context.userId,
      data,
    ),
  );

export const testIntegration = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(testIntegrationSchema)
  .handler(({ context, data }) =>
    CommunicationsService.testIntegration(
      context.organizationId,
      context.userId,
      data,
    ),
  );
export const createWebhookEndpoint = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(createWebhookEndpointSchema)
  .handler(({ context, data }) =>
    CommunicationsService.createWebhookEndpoint(
      context.organizationId,
      context.userId,
      data,
    ),
  );
export const testWebhookEndpoint = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(testWebhookEndpointSchema)
  .handler(({ context, data }) =>
    CommunicationsService.testWebhookEndpoint(
      context.organizationId,
      context.userId,
      data,
    ),
  );
export const retryWebhookDelivery = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(retryWebhookDeliverySchema)
  .handler(({ context, data }) =>
    CommunicationsService.retryWebhookDelivery(
      context.organizationId,
      context.userId,
      data,
    ),
  );

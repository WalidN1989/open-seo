import { z } from "zod";

export const createWhatsappConnectionSchema = z.object({
  provider: z.enum(["meta_cloud", "twilio", "custom"]),
  displayPhoneNumber: z.string().trim().max(40).optional(),
  externalAccountId: z.string().trim().max(200).optional(),
  credentialReference: z.string().trim().max(500).optional(),
});
export const createWhatsappTemplateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  languageCode: z.string().trim().min(2).max(10).default("en"),
  category: z
    .enum(["marketing", "utility", "authentication"])
    .default("marketing"),
  body: z.string().trim().min(1).max(4096),
  connectionId: z.string().min(1).optional(),
  externalTemplateId: z.string().trim().max(200).optional(),
  status: z.enum(["draft", "pending", "approved", "rejected"]).default("draft"),
});
export const sendWhatsappMessageSchema = z.object({
  conversationId: z.string().min(1),
  body: z.string().trim().min(1).max(4096),
});
export const updateWhatsappConversationSchema = z.object({
  conversationId: z.string().min(1),
  assignedMemberId: z.string().min(1).nullable().optional(),
  contactId: z.string().min(1).nullable().optional(),
  status: z.enum(["open", "pending", "closed"]).optional(),
});
export const createWhatsappCampaignSchema = z.object({
  name: z.string().trim().min(1).max(150),
  connectionId: z.string().min(1),
  templateId: z.string().min(1),
  scheduledAt: z.string().datetime().optional(),
});
export const launchWhatsappCampaignSchema = z.object({
  campaignId: z.string().min(1),
});
export const createWhatsappAutomationSchema = z.object({
  name: z.string().trim().min(1).max(150),
  triggerType: z.enum(["keyword", "first_message", "outside_hours"]),
  matchValue: z.string().trim().max(500).optional(),
  responseTemplateId: z.string().min(1),
});
export const createWhatsappOrderSchema = z.object({
  conversationId: z.string().min(1).optional(),
  contactId: z.string().min(1).optional(),
  externalOrderId: z.string().trim().max(200).optional(),
  summary: z.string().trim().min(1).max(2000),
  amountCents: z.number().int().min(0).max(1_000_000_000).default(0),
});
export const createVoiceAgentSchema = z.object({
  name: z.string().trim().min(1).max(100),
  speechToTextProvider: z.string().trim().max(100).optional(),
  textToSpeechProvider: z.string().trim().max(100).optional(),
  modelProvider: z.string().trim().max(100).optional(),
  credentialReference: z.string().trim().max(500).optional(),
});
export const startVoiceConversationSchema = z.object({
  agentConfigId: z.string().min(1),
  contactId: z.string().min(1).optional(),
});
export const appendVoiceTranscriptSchema = z.object({
  conversationId: z.string().min(1),
  speaker: z.enum(["user", "agent", "system"]),
  transcript: z.string().trim().min(1).max(20_000),
});
export const endVoiceConversationSchema = z.object({
  conversationId: z.string().min(1),
});
export const transcribeVoiceAudioSchema = z.object({
  conversationId: z.string().min(1),
  audioBase64: z.string().min(1).max(12_000_000),
  mimeType: z.string().trim().min(1).max(100),
  language: z.string().trim().min(2).max(20).default("multi"),
});
export const synthesizeVoiceSpeechSchema = z.object({
  conversationId: z.string().min(1),
  text: z.string().trim().min(1).max(1900),
  model: z.string().trim().min(1).max(100).default("aura-2-asteria-en"),
});
export const createIntegrationSchema = z.object({
  providerKey: z.string().trim().min(1).max(100),
  displayName: z.string().trim().min(1).max(200),
  credentialReference: z.string().trim().max(500).optional(),
});
export const testIntegrationSchema = z.object({
  connectionId: z.string().min(1),
});
export const createWebhookEndpointSchema = z.object({
  name: z.string().trim().min(1).max(100),
  url: z.url().max(2048),
  secretReference: z.string().trim().min(1).max(200),
  eventTypes: z.array(z.string().trim().min(1).max(100)).min(1).max(30),
});
export const testWebhookEndpointSchema = z.object({
  endpointId: z.string().min(1),
  eventType: z.string().trim().min(1).max(100),
  payload: z.record(z.string(), z.unknown()),
});
export const retryWebhookDeliverySchema = z.object({
  deliveryId: z.string().min(1),
});

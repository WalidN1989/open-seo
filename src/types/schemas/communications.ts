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
});
export const createVoiceAgentSchema = z.object({
  name: z.string().trim().min(1).max(100),
  speechToTextProvider: z.string().trim().max(100).optional(),
  textToSpeechProvider: z.string().trim().max(100).optional(),
  modelProvider: z.string().trim().max(100).optional(),
  credentialReference: z.string().trim().max(500).optional(),
});
export const createIntegrationSchema = z.object({
  providerKey: z.string().trim().min(1).max(100),
  displayName: z.string().trim().min(1).max(200),
  credentialReference: z.string().trim().max(500).optional(),
});

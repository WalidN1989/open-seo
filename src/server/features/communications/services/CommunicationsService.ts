import type { z } from "zod";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import type {
  createIntegrationSchema,
  createVoiceAgentSchema,
  createWhatsappConnectionSchema,
  createWhatsappTemplateSchema,
} from "@/types/schemas/communications";
import { CommunicationsRepository } from "../repositories/CommunicationsRepository";

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

export const CommunicationsService = {
  createIntegration,
  createVoiceAgent,
  createWhatsappConnection,
  createWhatsappTemplate,
  integrationsWorkspace,
  voiceWorkspace,
  whatsappWorkspace,
};

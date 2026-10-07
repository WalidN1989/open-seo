import { AppError } from "@/server/lib/errors";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { PhoneCallRepository } from "../repositories/PhoneCallRepository";
import { VoiceAgentRepository } from "../repositories/VoiceAgentRepository";

async function listCalls(
  organizationId: string,
  userId: string,
  input: { since?: string; status?: string; limit: number },
) {
  await BusinessModuleService.requireAccess(organizationId, userId, "voice");
  return PhoneCallRepository.listCalls(organizationId, input.limit, input);
}

async function getCall(organizationId: string, userId: string, callId: string) {
  await BusinessModuleService.requireAccess(organizationId, userId, "voice");
  const row = await PhoneCallRepository.getCall(organizationId, callId);
  if (!row) throw new AppError("NOT_FOUND");
  return row;
}

async function listAgents(organizationId: string, userId: string) {
  await BusinessModuleService.requireAccess(organizationId, userId, "voice");
  return VoiceAgentRepository.list(organizationId);
}

async function getAgent(
  organizationId: string,
  userId: string,
  agentId: string,
) {
  await BusinessModuleService.requireAccess(organizationId, userId, "voice");
  const row = await VoiceAgentRepository.get(organizationId, agentId);
  if (!row) throw new AppError("NOT_FOUND");
  return row;
}

async function updateAgent(
  organizationId: string,
  userId: string,
  agentId: string,
  patch: {
    prompt?: string | null;
    greeting?: string | null;
    businessHours?: Record<string, unknown>;
    status?: "draft" | "active" | "paused";
    voice?: string | null;
  },
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "voice",
    "manage",
  );
  const before = await getAgent(organizationId, userId, agentId);
  const version = await VoiceAgentRepository.updateWithVersion(
    organizationId,
    userId,
    agentId,
    before,
    patch,
  );
  const after = await getAgent(organizationId, userId, agentId);
  return { before, after, version };
}

export const VoiceMcpService = {
  listCalls,
  getCall,
  listAgents,
  getAgent,
  updateAgent,
};

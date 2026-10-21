import type { z } from "zod";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { BusinessAuditRepository } from "@/server/features/business-modules/repositories/BusinessAuditRepository";
import { CommunicationsRepository } from "@/server/features/communications/repositories/CommunicationsRepository";
import { createSmsCampaignDraftSchema } from "@/types/schemas/sms-campaigns";
import { SmsCampaignDraftRepository } from "../repositories/SmsCampaignDraftRepository";

async function requireConnection(organizationId: string, connectionId: string) {
  const connection = await CommunicationsRepository.getIntegration(
    organizationId,
    connectionId,
  );
  if (!connection || connection.providerKey !== "fitsms")
    throw new Error("FITSMS connection not found.");
}

async function list(
  organizationId: string,
  userId: string,
  connectionId: string,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "integrations",
  );
  await requireConnection(organizationId, connectionId);
  return SmsCampaignDraftRepository.list(organizationId, connectionId);
}

async function create(
  organizationId: string,
  userId: string,
  input: z.infer<typeof createSmsCampaignDraftSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "integrations",
    "manage",
  );
  const parsed = createSmsCampaignDraftSchema.parse(input);
  await requireConnection(organizationId, parsed.connectionId);
  const draft = await SmsCampaignDraftRepository.create(organizationId, parsed);
  await BusinessAuditRepository.record({
    organizationId,
    actorUserId: userId,
    action: "sms.campaign.drafted",
    targetType: "sms_campaign_draft",
    targetId: draft.id,
  });
  return draft;
}

export const SmsCampaignDraftService = { list, create };

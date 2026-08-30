import { BusinessSettingsRepository } from "../repositories/BusinessSettingsRepository";
import { BusinessAuditRepository } from "../repositories/BusinessAuditRepository";
import { BusinessModuleService } from "./BusinessModuleService";
import { normalizeCurrency } from "@/shared/currencies";

async function getSettings(organizationId: string, userId: string) {
  await BusinessModuleService.requireAccess(organizationId, userId, "crm");
  const row = await BusinessSettingsRepository.getOrCreate(organizationId);
  return { currency: normalizeCurrency(row?.currency) };
}

/**
 * Changing the currency relabels every stored amount; it does not convert
 * them. That is a workspace-wide decision, so it takes admin rights and is
 * recorded with what it changed from.
 */
async function setCurrency(
  organizationId: string,
  userId: string,
  input: { currency: string },
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "crm",
    "admin",
  );
  const before = await BusinessSettingsRepository.getOrCreate(organizationId);
  const currency = normalizeCurrency(input.currency);
  const row = await BusinessSettingsRepository.setCurrency(
    organizationId,
    currency,
  );
  await BusinessAuditRepository.record({
    organizationId,
    actorUserId: userId,
    action: "settings.currency.changed",
    targetType: "business_settings",
    targetId: row?.id ?? organizationId,
    metadata: { from: before?.currency ?? null, to: currency },
  });
  return { currency };
}

export const BusinessSettingsService = { getSettings, setCurrency };

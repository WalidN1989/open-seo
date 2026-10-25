import type { z } from "zod";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { BusinessAuditRepository } from "@/server/features/business-modules/repositories/BusinessAuditRepository";
import { AppError } from "@/server/lib/errors";
import {
  createCaseSchema,
  updateCaseSchema,
  listCasesSchema,
} from "@/types/schemas/voiceCases";
import { CaseRepository as Repo } from "../repositories/CaseRepository";

async function authorizeLinks(
  organizationId: string,
  userId: string,
  input: Partial<z.infer<typeof createCaseSchema>>,
) {
  if (input.whatsappConversationId)
    await BusinessModuleService.requireAccess(
      organizationId,
      userId,
      "whatsapp",
    );
  if (input.smsConversationId)
    await BusinessModuleService.requireAccess(organizationId, userId, "sms");
  if (input.contactId || input.leadId || input.orderId)
    await BusinessModuleService.requireAccess(organizationId, userId, "crm");
  if (!(await Repo.validLinks(organizationId, input)))
    throw new AppError(
      "NOT_FOUND",
      "A linked record was not found in this workspace.",
    );
}
async function create(
  organizationId: string,
  userId: string,
  raw: z.infer<typeof createCaseSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "voice",
    "manage",
  );
  const input = createCaseSchema.parse(raw);
  await authorizeLinks(organizationId, userId, input);
  const timestamp = new Date().toISOString();
  const row = await Repo.insert({
    ...input,
    id: input.id ?? crypto.randomUUID(),
    organizationId,
    createdAt: timestamp,
    updatedAt: timestamp,
    closedAt: input.status === "closed" ? timestamp : null,
  });
  if (!row) throw new AppError("VALIDATION_ERROR", "Case ID is unavailable.");
  await BusinessAuditRepository.record({
    organizationId,
    actorUserId: userId,
    action: "voice.case.created",
    targetType: "voice_case",
    targetId: row.id,
  });
  return row;
}
async function update(
  organizationId: string,
  userId: string,
  raw: z.infer<typeof updateCaseSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "voice",
    "manage",
  );
  const { caseId, externalConversationId, ...patch } =
    updateCaseSchema.parse(raw);
  const existing = await Repo.get(organizationId, caseId);
  if (!existing)
    throw new AppError("NOT_FOUND", "Case not found in this workspace.");
  await authorizeLinks(organizationId, userId, patch);
  if (
    externalConversationId &&
    !(await Repo.linkCall(organizationId, caseId, externalConversationId))
  )
    throw new AppError(
      "VALIDATION_ERROR",
      "This conversation is already linked to another case.",
    );
  const row = await Repo.update(organizationId, caseId, {
    ...patch,
    ...(patch.status
      ? {
          closedAt: patch.status === "closed" ? new Date().toISOString() : null,
        }
      : {}),
    ...(patch.status === "closed" ||
    (existing.status === "closed" && patch.status)
      ? { readyToClose: false, readyReason: null }
      : {}),
  });
  if (!row) throw new AppError("NOT_FOUND");
  await BusinessAuditRepository.record({
    organizationId,
    actorUserId: userId,
    action: "voice.case.updated",
    targetType: "voice_case",
    targetId: caseId,
  });
  return row;
}
async function list(
  organizationId: string,
  userId: string,
  raw: z.infer<typeof listCasesSchema>,
) {
  await BusinessModuleService.requireAccess(organizationId, userId, "voice");
  const options = listCasesSchema.parse(raw);
  const rows = await Repo.list(organizationId, options);
  const page = rows.slice(0, options.limit);
  const calls = options.caseId
    ? await Repo.callLinks(
        organizationId,
        page.map((row) => row.id),
      )
    : [];
  return {
    cases: page.map((row) => ({
      ...row,
      notes: options.caseId ? row.notes : undefined,
      calls: calls
        .filter((call) => call.caseId === row.id)
        .map(({ externalConversationId, callId }) => ({
          externalConversationId,
          callId,
        })),
    })),
    ...(rows.length > options.limit ? { next: page.at(-1)?.id } : {}),
    policy: await Repo.policy(organizationId),
  };
}
export const CaseService = { create, update, list };

import { BusinessModuleRepository } from "@/server/features/business-modules/repositories/BusinessModuleRepository";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { AppError } from "@/server/lib/errors";
import type { CreateReminderInput } from "@/types/schemas/crm";
import { LeadDetailRepository } from "../repositories/LeadDetailRepository";
import { ReminderRepository as Repo } from "../repositories/ReminderRepository";

/**
 * Reminders belong to the member who set them. Anyone without the leads
 * module simply has none, so the bell stays quiet instead of erroring on
 * every page.
 */
async function memberFor(organizationId: string, userId: string) {
  const membership = await BusinessModuleRepository.findMembership(
    organizationId,
    userId,
  );
  if (!membership) throw new AppError("FORBIDDEN");
  return membership.id;
}

async function hasLeads(organizationId: string, userId: string) {
  try {
    await BusinessModuleService.requireAccess(organizationId, userId, "leads");
    return true;
  } catch {
    return false;
  }
}

async function list(organizationId: string, userId: string) {
  if (!(await hasLeads(organizationId, userId))) return [];
  const memberId = await memberFor(organizationId, userId);
  const rows = await Repo.listForMember(organizationId, memberId);
  return rows.map((row) => ({
    ...row.reminder,
    label: row.companyName ?? row.leadTitle ?? null,
  }));
}

async function create(
  organizationId: string,
  userId: string,
  input: CreateReminderInput,
) {
  await BusinessModuleService.requireAccess(organizationId, userId, "leads");
  const memberId = await memberFor(organizationId, userId);
  if (
    input.leadId &&
    !(await LeadDetailRepository.getLead(organizationId, input.leadId))
  ) {
    throw new AppError("NOT_FOUND");
  }
  return Repo.create({
    organizationId,
    memberId,
    leadId: input.leadId ?? null,
    title: input.title,
    note: input.note ?? null,
    remindAt: input.remindAt,
  });
}

async function change(
  organizationId: string,
  userId: string,
  id: string,
  changes: { status?: "pending" | "done"; remindAt?: string },
) {
  const memberId = await memberFor(organizationId, userId);
  const row = await Repo.update(organizationId, memberId, id, changes);
  if (!row) throw new AppError("NOT_FOUND");
  return row;
}

function snooze(
  organizationId: string,
  userId: string,
  id: string,
  minutes: number,
) {
  return change(organizationId, userId, id, {
    status: "pending",
    remindAt: new Date(Date.now() + minutes * 60_000).toISOString(),
  });
}

function markDone(organizationId: string, userId: string, id: string) {
  return change(organizationId, userId, id, { status: "done" });
}

async function remove(organizationId: string, userId: string, id: string) {
  const memberId = await memberFor(organizationId, userId);
  if (!(await Repo.remove(organizationId, memberId, id))) {
    throw new AppError("NOT_FOUND");
  }
  return { ok: true };
}

export const ReminderService = { list, create, snooze, markDone, remove };

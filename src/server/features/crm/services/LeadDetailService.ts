import { BusinessAuditRepository } from "@/server/features/business-modules/repositories/BusinessAuditRepository";
import { BusinessModuleRepository } from "@/server/features/business-modules/repositories/BusinessModuleRepository";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { AppError } from "@/server/lib/errors";
import type { LogLeadActivityInput } from "@/types/schemas/crm";
import { CrmRepository } from "../repositories/CrmRepository";
import { LeadDetailRepository as Repo } from "../repositories/LeadDetailRepository";
import { ReminderRepository } from "../repositories/ReminderRepository";
import { CrmService } from "./CrmService";

const KIND_LABEL: Record<LogLeadActivityInput["activityType"], string> = {
  call: "Call",
  whatsapp: "WhatsApp",
  meeting: "Meeting",
  email: "Email",
  visit: "Site visit",
  note: "Note",
  quotation: "Quotation",
  task: "Task",
};

/**
 * The lead page: one lead with everything that happened around it, so a
 * person can see at a glance whether the WhatsApp and the email went out
 * and what to do next.
 */
async function getLeadDetail(
  organizationId: string,
  userId: string,
  leadId: string,
) {
  await BusinessModuleService.requireAccess(organizationId, userId, "leads");
  const row = await Repo.getLead(organizationId, leadId);
  if (!row) throw new AppError("NOT_FOUND");
  const contact = row.contact;
  const phones = [contact?.phone, contact?.whatsappPhone].filter(
    (value): value is string => Boolean(value),
  );
  const [stages, activities, calls, whatsapp, emails, reminders] =
    await Promise.all([
      CrmService.ensureStages(organizationId),
      CrmRepository.listActivities(organizationId, leadId),
      Repo.listCalls(organizationId, leadId),
      contact ? Repo.listWhatsapp(organizationId, contact.id, phones) : [],
      contact?.email ? Repo.listEmails(organizationId, contact.email) : [],
      ReminderRepository.listPendingForLead(organizationId, leadId),
    ]);
  return { ...row, stages, activities, calls, whatsapp, emails, reminders };
}

async function logActivity(
  organizationId: string,
  userId: string,
  input: LogLeadActivityInput,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "leads",
    "manage",
  );
  const membership = await BusinessModuleRepository.findMembership(
    organizationId,
    userId,
  );
  if (!membership) throw new AppError("FORBIDDEN");
  const row = await Repo.getLead(organizationId, input.leadId);
  if (!row) throw new AppError("NOT_FOUND");

  const firstLine = input.notes.split("\n")[0].trim();
  const activity = await CrmRepository.createActivity(
    organizationId,
    membership.id,
    {
      leadId: input.leadId,
      contactId: row.contact?.id,
      activityType: input.activityType,
      subject: `${KIND_LABEL[input.activityType]}: ${firstLine}`.slice(0, 200),
      notes: input.notes,
      outcome: input.outcome,
    },
  );

  const status =
    input.outcome === "won" || input.outcome === "lost"
      ? input.outcome
      : undefined;
  if (input.nextActionDue || status) {
    await CrmRepository.updateLead(organizationId, {
      id: input.leadId,
      ...(input.nextActionDue
        ? {
            nextActionDue: input.nextActionDue,
            nextAction: input.nextAction || `Follow up — ${row.lead.title}`,
          }
        : {}),
      ...(status ? { status } : {}),
    });
  }

  const reminder =
    input.remind && input.nextActionDue
      ? await ReminderRepository.create({
          organizationId,
          memberId: membership.id,
          leadId: input.leadId,
          title:
            input.nextAction ||
            `Follow up — ${row.company?.name ?? row.lead.title}`,
          note: reminderNote(row),
          remindAt: input.nextActionDue,
        })
      : null;

  await BusinessAuditRepository.record({
    organizationId,
    actorUserId: userId,
    action: "lead.activity.created",
    targetType: "lead",
    targetId: input.leadId,
    metadata: {
      activityId: activity.id,
      activityType: activity.activityType,
      outcome: input.outcome ?? null,
      reminderId: reminder?.id ?? null,
    },
  });
  return { activity, reminder };
}

/** "Website build · Iftikhar · +61400000000": what the popup shows. */
function reminderNote(
  row: NonNullable<Awaited<ReturnType<typeof Repo.getLead>>>,
) {
  const contact = row.contact;
  return (
    [
      row.lead.title,
      contact
        ? [contact.firstName, contact.lastName].filter(Boolean).join(" ")
        : null,
      contact?.whatsappPhone ?? contact?.phone ?? null,
    ]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 500) || null
  );
}

export const LeadDetailService = { getLeadDetail, logActivity };

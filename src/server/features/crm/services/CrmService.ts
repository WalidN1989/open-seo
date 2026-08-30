/* oxlint-disable max-lines */
import { BusinessModuleRepository } from "@/server/features/business-modules/repositories/BusinessModuleRepository";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { BusinessAuditRepository } from "@/server/features/business-modules/repositories/BusinessAuditRepository";
import { CommunicationsService } from "@/server/features/communications/services/CommunicationsService";
import { AppError } from "@/server/lib/errors";
import type {
  CreateActivityInput,
  CreateCompanyInput,
  CreateContactInput,
  CreateInquiryInput,
  CreateLeadInput,
  CreateMeetingInput,
  PromoteInquiryInput,
  UpdateLeadInput,
  ImportHunterDomainInput,
} from "@/types/schemas/crm";
import { CrmRepository } from "../repositories/CrmRepository";
import { CommunicationsRepository } from "@/server/features/communications/repositories/CommunicationsRepository";
import { searchHunterDomain } from "@/server/features/communications/providers/integrations";

const defaultStages = [
  { name: "Prospect", position: 0, stageType: "open" as const },
  { name: "Qualified", position: 1, stageType: "open" as const },
  { name: "Meeting", position: 2, stageType: "open" as const },
  { name: "Quotation", position: 3, stageType: "open" as const },
  { name: "Negotiation", position: 4, stageType: "open" as const },
  { name: "Purchase order", position: 5, stageType: "open" as const },
  { name: "Won", position: 6, stageType: "won" as const },
  { name: "Lost", position: 7, stageType: "lost" as const },
] as const;

async function ensureStages(organizationId: string) {
  let stages = await CrmRepository.listStages(organizationId);
  if (stages.length === 0) {
    await CrmRepository.createStages(organizationId, defaultStages);
    stages = await CrmRepository.listStages(organizationId);
  }
  return stages;
}

async function getLeadsWorkspace(organizationId: string, userId: string) {
  await BusinessModuleService.requireAccess(organizationId, userId, "leads");
  const [leads, stages, members, hunter, hunterAlias] = await Promise.all([
    CrmRepository.listLeads(organizationId),
    ensureStages(organizationId),
    BusinessModuleRepository.listMembers(organizationId),
    CommunicationsRepository.getIntegrationByProvider(organizationId, "hunter"),
    CommunicationsRepository.getIntegrationByProvider(
      organizationId,
      "hunter.io",
    ),
  ]);
  return {
    leads,
    stages,
    members,
    hunterConnections: [hunter, hunterAlias].filter(
      (connection) => connection?.status === "connected",
    ),
  };
}

async function importHunterDomain(
  organizationId: string,
  userId: string,
  input: ImportHunterDomainInput,
) {
  await Promise.all([
    BusinessModuleService.requireAccess(
      organizationId,
      userId,
      "integrations",
      "manage",
    ),
    BusinessModuleService.requireAccess(
      organizationId,
      userId,
      "leads",
      "manage",
    ),
    BusinessModuleService.requireAccess(
      organizationId,
      userId,
      "crm",
      "manage",
    ),
  ]);
  const connection = await CommunicationsRepository.getIntegration(
    organizationId,
    input.connectionId,
  );
  if (!connection || connection.status !== "connected") {
    throw new Error("Connect and test Hunter.io before importing leads.");
  }
  const results = await searchHunterDomain(connection, input);
  const stages = await ensureStages(organizationId);
  const source = `Hunter.io:${input.domain}`;
  let imported = 0;
  let skipped = 0;
  for (const result of results) {
    const email = result.value.trim().toLowerCase();
    let contact = await CrmRepository.findContactByEmail(organizationId, email);
    if (!contact) {
      contact = await CrmRepository.createContact(organizationId, {
        firstName:
          result.first_name?.trim() || email.split("@")[0] || "Prospect",
        lastName: result.last_name?.trim() || undefined,
        email,
      });
    }
    if (
      await CrmRepository.leadExistsForContactSource(
        organizationId,
        contact.id,
        source,
      )
    ) {
      skipped += 1;
      continue;
    }
    const fullName = [result.first_name, result.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    await CrmRepository.createLead(organizationId, {
      title: `${fullName || email}${result.position ? ` — ${result.position}` : ""}`,
      source,
      contactId: contact.id,
      stageId: stages[0]?.id,
      priority: "medium",
      valueCents: 0,
      notes:
        result.confidence == null
          ? undefined
          : `Hunter confidence: ${Math.max(0, Math.min(100, result.confidence))}%`,
    });
    imported += 1;
  }
  await BusinessAuditRepository.record({
    organizationId,
    actorUserId: userId,
    action: "leads.hunter.imported",
    targetType: "integration_connection",
    targetId: connection.id,
    metadata: { domain: input.domain, imported, skipped },
  });
  await CommunicationsService.emitBusinessEvent(
    organizationId,
    "leads.hunter.imported",
    { domain: input.domain, imported, skipped },
  );
  return { imported, skipped, discovered: results.length };
}

async function createLead(
  organizationId: string,
  userId: string,
  input: CreateLeadInput,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "leads",
    "manage",
  );
  const stages = await ensureStages(organizationId);
  const candidate = {
    ...input,
    stageId: input.stageId ?? stages[0]?.id,
  };
  if (!(await CrmRepository.validateLeadRelations(organizationId, candidate))) {
    throw new AppError("FORBIDDEN");
  }
  const lead = await CrmRepository.createLead(organizationId, candidate);
  await CommunicationsService.emitBusinessEvent(
    organizationId,
    "lead.created",
    {
      leadId: lead.id,
      title: lead.title,
      stageId: lead.stageId,
      source: lead.source,
    },
  );
  await BusinessAuditRepository.record({
    organizationId,
    actorUserId: userId,
    action: "lead.created",
    targetType: "lead",
    targetId: lead.id,
    metadata: { stageId: lead.stageId, source: lead.source },
  });
  return lead;
}

async function updateLead(
  organizationId: string,
  userId: string,
  input: UpdateLeadInput,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "leads",
    "manage",
  );
  if (!(await CrmRepository.validateLeadRelations(organizationId, input))) {
    throw new AppError("FORBIDDEN");
  }
  const row = await CrmRepository.updateLead(organizationId, input);
  if (!row) throw new AppError("NOT_FOUND");
  await CommunicationsService.emitBusinessEvent(
    organizationId,
    "lead.updated",
    {
      leadId: row.id,
      stageId: row.stageId,
      status: row.status,
    },
  );
  await BusinessAuditRepository.record({
    organizationId,
    actorUserId: userId,
    action: "lead.updated",
    targetType: "lead",
    targetId: row.id,
    metadata: { stageId: row.stageId, status: row.status },
  });
  return row;
}

async function getCrmWorkspace(organizationId: string, userId: string) {
  await BusinessModuleService.requireAccess(organizationId, userId, "crm");
  const [contacts, companies, inquiries, meetings] = await Promise.all([
    CrmRepository.listContacts(organizationId),
    CrmRepository.listCompanies(organizationId),
    CrmRepository.listInquiries(organizationId),
    CrmRepository.listMeetings(organizationId),
  ]);
  return { contacts, companies, inquiries, meetings };
}

async function createContact(
  organizationId: string,
  userId: string,
  input: CreateContactInput,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "crm",
    "manage",
  );
  if (
    input.companyId &&
    !(await CrmRepository.validateLeadRelations(organizationId, {
      companyId: input.companyId,
    }))
  ) {
    throw new AppError("FORBIDDEN");
  }
  const contact = await CrmRepository.createContact(organizationId, input);
  await CommunicationsService.emitBusinessEvent(
    organizationId,
    "contact.created",
    { contactId: contact.id, companyId: contact.companyId },
  );
  await BusinessAuditRepository.record({
    organizationId,
    actorUserId: userId,
    action: "contact.created",
    targetType: "contact",
    targetId: contact.id,
  });
  return contact;
}

async function createCompany(
  organizationId: string,
  userId: string,
  input: CreateCompanyInput,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "crm",
    "manage",
  );
  const company = await CrmRepository.createCompany(organizationId, input);
  await CommunicationsService.emitBusinessEvent(
    organizationId,
    "company.created",
    { companyId: company.id, name: company.name },
  );
  await BusinessAuditRepository.record({
    organizationId,
    actorUserId: userId,
    action: "company.created",
    targetType: "company",
    targetId: company.id,
  });
  return company;
}

async function listActivities(
  organizationId: string,
  userId: string,
  leadId: string,
) {
  await BusinessModuleService.requireAccess(organizationId, userId, "leads");
  if (
    !(await CrmRepository.leadBelongsToOrganization(organizationId, leadId))
  ) {
    throw new AppError("NOT_FOUND");
  }
  return CrmRepository.listActivities(organizationId, leadId);
}

async function createActivity(
  organizationId: string,
  userId: string,
  input: CreateActivityInput,
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
  if (
    !(await CrmRepository.leadBelongsToOrganization(
      organizationId,
      input.leadId,
    ))
  ) {
    throw new AppError("NOT_FOUND");
  }
  const activity = await CrmRepository.createActivity(
    organizationId,
    membership.id,
    input,
  );
  await BusinessAuditRepository.record({
    organizationId,
    actorUserId: userId,
    action: "lead.activity.created",
    targetType: "lead",
    targetId: input.leadId,
    metadata: { activityId: activity.id, activityType: activity.activityType },
  });
  return activity;
}

async function createInquiry(
  organizationId: string,
  userId: string,
  input: CreateInquiryInput,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "crm",
    "manage",
  );
  const inquiry = await CrmRepository.createInquiry(organizationId, input);
  await CommunicationsService.emitBusinessEvent(
    organizationId,
    "inquiry.created",
    { inquiryId: inquiry.id, title: inquiry.title, product: inquiry.product },
  );
  await BusinessAuditRepository.record({
    organizationId,
    actorUserId: userId,
    action: "inquiry.created",
    targetType: "inquiry",
    targetId: inquiry.id,
  });
  return inquiry;
}

async function createMeeting(
  organizationId: string,
  userId: string,
  input: CreateMeetingInput,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "crm",
    "manage",
  );
  const relationsValid = await CrmRepository.validateLeadRelations(
    organizationId,
    { assignedMemberId: input.assignedMemberId },
  );
  const leadValid = input.leadId
    ? await CrmRepository.leadBelongsToOrganization(
        organizationId,
        input.leadId,
      )
    : true;
  if (!relationsValid || !leadValid) {
    throw new AppError("FORBIDDEN");
  }
  const meeting = await CrmRepository.createMeeting(organizationId, input);
  await CommunicationsService.emitBusinessEvent(
    organizationId,
    "meeting.created",
    {
      meetingId: meeting.id,
      leadId: meeting.leadId,
      startsAt: meeting.startsAt,
    },
  );
  await BusinessAuditRepository.record({
    organizationId,
    actorUserId: userId,
    action: "meeting.created",
    targetType: "meeting",
    targetId: meeting.id,
    metadata: { leadId: meeting.leadId, startsAt: meeting.startsAt },
  });
  return meeting;
}

async function promoteInquiry(
  organizationId: string,
  userId: string,
  input: PromoteInquiryInput,
) {
  await Promise.all([
    BusinessModuleService.requireAccess(
      organizationId,
      userId,
      "crm",
      "manage",
    ),
    BusinessModuleService.requireAccess(
      organizationId,
      userId,
      "leads",
      "manage",
    ),
  ]);
  const inquiry = await CrmRepository.getInquiry(
    organizationId,
    input.inquiryId,
  );
  if (!inquiry) throw new AppError("NOT_FOUND");
  if (inquiry.wonLeadId) throw new AppError("CONFLICT");
  if (
    !(await CrmRepository.validateLeadRelations(organizationId, {
      assignedMemberId: input.assignedMemberId,
    }))
  ) {
    throw new AppError("FORBIDDEN");
  }
  const stages = await ensureStages(organizationId);
  const lead = await CrmRepository.createLead(organizationId, {
    title: inquiry.title,
    source: "CRM inquiry",
    priority: input.priority,
    valueCents: inquiry.targetValueCents,
    stageId: stages[0]?.id,
    assignedMemberId: input.assignedMemberId,
    notes: [inquiry.product, inquiry.description].filter(Boolean).join("\n\n"),
  });
  await CrmRepository.linkInquiryToLead(organizationId, inquiry.id, lead.id);
  await CommunicationsService.emitBusinessEvent(
    organizationId,
    "inquiry.promoted",
    { inquiryId: inquiry.id, leadId: lead.id },
  );
  await BusinessAuditRepository.record({
    organizationId,
    actorUserId: userId,
    action: "inquiry.promoted",
    targetType: "lead",
    targetId: lead.id,
    metadata: { inquiryId: inquiry.id },
  });
  return lead;
}

export const CrmService = {
  createActivity,
  createCompany,
  createContact,
  createInquiry,
  createLead,
  createMeeting,
  getCrmWorkspace,
  getLeadsWorkspace,
  importHunterDomain,
  listActivities,
  promoteInquiry,
  updateLead,
};

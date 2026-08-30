import { BusinessModuleRepository } from "@/server/features/business-modules/repositories/BusinessModuleRepository";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { CommunicationsService } from "@/server/features/communications/services/CommunicationsService";
import { AppError } from "@/server/lib/errors";
import type {
  CreateActivityInput,
  CreateCompanyInput,
  CreateContactInput,
  CreateInquiryInput,
  CreateLeadInput,
  CreateMeetingInput,
  UpdateLeadInput,
} from "@/types/schemas/crm";
import { CrmRepository } from "../repositories/CrmRepository";

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
  const [leads, stages] = await Promise.all([
    CrmRepository.listLeads(organizationId),
    ensureStages(organizationId),
  ]);
  return { leads, stages };
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
  return CrmRepository.createActivity(organizationId, membership.id, input);
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
  return meeting;
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
  listActivities,
  updateLead,
};

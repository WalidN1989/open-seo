import { BusinessModuleRepository } from "@/server/features/business-modules/repositories/BusinessModuleRepository";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { AppError } from "@/server/lib/errors";
import type {
  CreateActivityInput,
  CreateCompanyInput,
  CreateContactInput,
  CreateLeadInput,
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
  return CrmRepository.createLead(organizationId, candidate);
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
  return row;
}

async function getCrmWorkspace(organizationId: string, userId: string) {
  await BusinessModuleService.requireAccess(organizationId, userId, "crm");
  const [contacts, companies] = await Promise.all([
    CrmRepository.listContacts(organizationId),
    CrmRepository.listCompanies(organizationId),
  ]);
  return { contacts, companies };
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
  return CrmRepository.createContact(organizationId, input);
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
  return CrmRepository.createCompany(organizationId, input);
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

export const CrmService = {
  createActivity,
  createCompany,
  createContact,
  createLead,
  getCrmWorkspace,
  getLeadsWorkspace,
  listActivities,
  updateLead,
};

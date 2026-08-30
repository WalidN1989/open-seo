/* oxlint-disable max-lines */
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  crmActivities,
  crmCompanies,
  crmContacts,
  crmInquiries,
  crmInquiryLeads,
  crmLeads,
  crmMeetings,
  crmPipelineStages,
  member,
} from "@/db/schema";
import type {
  CreateActivityInput,
  CreateCompanyInput,
  CreateContactInput,
  CreateLeadInput,
  CreateInquiryInput,
  CreateMeetingInput,
  UpdateLeadInput,
} from "@/types/schemas/crm";

const isPresent = <T>(query: Promise<T[]>) =>
  query.then((rows) => rows.length === 1);

async function listLeads(organizationId: string) {
  return db
    .select({
      lead: crmLeads,
      contact: crmContacts,
      company: crmCompanies,
      stage: crmPipelineStages,
    })
    .from(crmLeads)
    .leftJoin(
      crmContacts,
      and(
        eq(crmContacts.id, crmLeads.contactId),
        eq(crmContacts.organizationId, organizationId),
      ),
    )
    .leftJoin(
      crmCompanies,
      and(
        eq(crmCompanies.id, crmLeads.companyId),
        eq(crmCompanies.organizationId, organizationId),
      ),
    )
    .leftJoin(
      crmPipelineStages,
      and(
        eq(crmPipelineStages.id, crmLeads.stageId),
        eq(crmPipelineStages.organizationId, organizationId),
      ),
    )
    .where(eq(crmLeads.organizationId, organizationId))
    .orderBy(desc(crmLeads.updatedAt));
}

async function createLead(organizationId: string, input: CreateLeadInput) {
  const [row] = await db
    .insert(crmLeads)
    .values({ id: crypto.randomUUID(), organizationId, ...input })
    .returning();
  return row;
}

async function validateLeadRelations(
  organizationId: string,
  input: {
    contactId?: string | null;
    companyId?: string | null;
    stageId?: string | null;
    assignedMemberId?: string | null;
  },
) {
  const checks = await Promise.all([
    input.contactId
      ? isPresent(
          db
            .select({ id: crmContacts.id })
            .from(crmContacts)
            .where(
              and(
                eq(crmContacts.id, input.contactId),
                eq(crmContacts.organizationId, organizationId),
              ),
            )
            .limit(1),
        )
      : true,
    input.companyId
      ? isPresent(
          db
            .select({ id: crmCompanies.id })
            .from(crmCompanies)
            .where(
              and(
                eq(crmCompanies.id, input.companyId),
                eq(crmCompanies.organizationId, organizationId),
              ),
            )
            .limit(1),
        )
      : true,
    input.stageId
      ? isPresent(
          db
            .select({ id: crmPipelineStages.id })
            .from(crmPipelineStages)
            .where(
              and(
                eq(crmPipelineStages.id, input.stageId),
                eq(crmPipelineStages.organizationId, organizationId),
              ),
            )
            .limit(1),
        )
      : true,
    input.assignedMemberId
      ? isPresent(
          db
            .select({ id: member.id })
            .from(member)
            .where(
              and(
                eq(member.id, input.assignedMemberId),
                eq(member.organizationId, organizationId),
              ),
            )
            .limit(1),
        )
      : true,
  ]);
  return checks.every(Boolean);
}

async function leadBelongsToOrganization(
  organizationId: string,
  leadId: string,
) {
  const rows = await db
    .select({ id: crmLeads.id })
    .from(crmLeads)
    .where(
      and(eq(crmLeads.id, leadId), eq(crmLeads.organizationId, organizationId)),
    )
    .limit(1);
  return rows.length === 1;
}

async function updateLead(organizationId: string, input: UpdateLeadInput) {
  const { id, ...changes } = input;
  const [row] = await db
    .update(crmLeads)
    .set({ ...changes, updatedAt: new Date().toISOString() })
    .where(
      and(eq(crmLeads.id, id), eq(crmLeads.organizationId, organizationId)),
    )
    .returning();
  return row ?? null;
}

async function listStages(organizationId: string) {
  return db
    .select()
    .from(crmPipelineStages)
    .where(eq(crmPipelineStages.organizationId, organizationId))
    .orderBy(asc(crmPipelineStages.position));
}

async function createStages(
  organizationId: string,
  stages: ReadonlyArray<{
    name: string;
    position: number;
    stageType: "open" | "won" | "lost";
  }>,
) {
  await db
    .insert(crmPipelineStages)
    .values(
      stages.map((stage) => ({
        id: crypto.randomUUID(),
        organizationId,
        ...stage,
      })),
    )
    .onConflictDoNothing();
}

async function listContacts(organizationId: string) {
  return db
    .select({ contact: crmContacts, company: crmCompanies })
    .from(crmContacts)
    .leftJoin(
      crmCompanies,
      and(
        eq(crmCompanies.id, crmContacts.companyId),
        eq(crmCompanies.organizationId, organizationId),
      ),
    )
    .where(eq(crmContacts.organizationId, organizationId))
    .orderBy(asc(crmContacts.firstName), asc(crmContacts.lastName));
}

async function createContact(
  organizationId: string,
  input: CreateContactInput,
) {
  const [row] = await db
    .insert(crmContacts)
    .values({
      id: crypto.randomUUID(),
      organizationId,
      ...input,
      email: input.email || null,
    })
    .returning();
  return row;
}

async function findContactByEmail(organizationId: string, email: string) {
  const [row] = await db
    .select()
    .from(crmContacts)
    .where(
      and(
        eq(crmContacts.organizationId, organizationId),
        eq(crmContacts.email, email),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function leadExistsForContactSource(
  organizationId: string,
  contactId: string,
  source: string,
) {
  const [row] = await db
    .select({ id: crmLeads.id })
    .from(crmLeads)
    .where(
      and(
        eq(crmLeads.organizationId, organizationId),
        eq(crmLeads.contactId, contactId),
        eq(crmLeads.source, source),
      ),
    )
    .limit(1);
  return Boolean(row);
}

async function listCompanies(organizationId: string) {
  return db
    .select()
    .from(crmCompanies)
    .where(eq(crmCompanies.organizationId, organizationId))
    .orderBy(asc(crmCompanies.name));
}

async function createCompany(
  organizationId: string,
  input: CreateCompanyInput,
) {
  const [row] = await db
    .insert(crmCompanies)
    .values({ id: crypto.randomUUID(), organizationId, ...input })
    .returning();
  return row;
}

async function listActivities(organizationId: string, leadId: string) {
  return db
    .select()
    .from(crmActivities)
    .where(
      and(
        eq(crmActivities.organizationId, organizationId),
        eq(crmActivities.leadId, leadId),
      ),
    )
    .orderBy(desc(crmActivities.occurredAt));
}

async function createActivity(
  organizationId: string,
  createdByMemberId: string,
  input: CreateActivityInput,
) {
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const [row] = await db
    .insert(crmActivities)
    .values({
      id: crypto.randomUUID(),
      organizationId,
      createdByMemberId,
      ...input,
      occurredAt,
    })
    .returning();
  await db
    .update(crmLeads)
    .set({ lastActivityAt: occurredAt, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(crmLeads.id, input.leadId),
        eq(crmLeads.organizationId, organizationId),
      ),
    );
  return row;
}

async function listInquiries(organizationId: string) {
  return db
    .select()
    .from(crmInquiries)
    .where(eq(crmInquiries.organizationId, organizationId))
    .orderBy(desc(crmInquiries.updatedAt));
}

async function createInquiry(
  organizationId: string,
  input: CreateInquiryInput,
) {
  const [row] = await db
    .insert(crmInquiries)
    .values({ id: crypto.randomUUID(), organizationId, ...input })
    .returning();
  return row;
}

async function getInquiry(organizationId: string, inquiryId: string) {
  const [row] = await db
    .select()
    .from(crmInquiries)
    .where(
      and(
        eq(crmInquiries.organizationId, organizationId),
        eq(crmInquiries.id, inquiryId),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function linkInquiryToLead(
  organizationId: string,
  inquiryId: string,
  leadId: string,
) {
  await db.insert(crmInquiryLeads).values({
    id: crypto.randomUUID(),
    organizationId,
    inquiryId,
    leadId,
    role: "promoted",
  });
  const [inquiry] = await db
    .update(crmInquiries)
    .set({
      wonLeadId: leadId,
      status: "won",
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(crmInquiries.organizationId, organizationId),
        eq(crmInquiries.id, inquiryId),
      ),
    )
    .returning();
  return inquiry;
}

async function listMeetings(organizationId: string) {
  return db
    .select()
    .from(crmMeetings)
    .where(eq(crmMeetings.organizationId, organizationId))
    .orderBy(desc(crmMeetings.startsAt));
}

async function createMeeting(
  organizationId: string,
  input: CreateMeetingInput,
) {
  const [row] = await db
    .insert(crmMeetings)
    .values({
      id: crypto.randomUUID(),
      organizationId,
      ...input,
      meetingUrl: input.meetingUrl || null,
    })
    .returning();
  return row;
}

export const CrmRepository = {
  createActivity,
  createCompany,
  createContact,
  createInquiry,
  createLead,
  createMeeting,
  createStages,
  listActivities,
  findContactByEmail,
  leadExistsForContactSource,
  listCompanies,
  listContacts,
  listInquiries,
  listLeads,
  listMeetings,
  listStages,
  leadBelongsToOrganization,
  updateLead,
  validateLeadRelations,
  getInquiry,
  linkInquiryToLead,
};

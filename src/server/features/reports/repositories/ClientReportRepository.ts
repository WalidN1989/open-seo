import { and, desc, eq, inArray, isNull, like } from "drizzle-orm";
import { db } from "@/db";
import {
  clientReportProfiles,
  clientReports,
  organization,
  projects,
  whatsappConnections,
} from "@/db/schema";

function now() {
  return new Date().toISOString();
}

/**
 * The projects a report could be written about.
 *
 * Every client sits in its own workspace, so this reaches across
 * organizations — but only the ones the person is already a member of. The
 * register of what they may see is their membership, not this function.
 */
async function reportableProjects(organizationIds: string[]) {
  if (!organizationIds.length) return [];
  return db
    .select({
      id: projects.id,
      name: projects.name,
      domain: projects.domain,
      organizationId: projects.organizationId,
      organizationName: organization.name,
    })
    .from(projects)
    .innerJoin(organization, eq(organization.id, projects.organizationId))
    .where(
      and(
        inArray(projects.organizationId, organizationIds),
        isNull(projects.archivedAt),
      ),
    )
    .orderBy(organization.name, projects.name);
}

async function organizationName(organizationId: string) {
  const [row] = await db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);
  return row?.name ?? null;
}

/** The number the assistant answers on, if this business has one connected. */
async function whatsappNumber(organizationId: string) {
  const [row] = await db
    .select({ phone: whatsappConnections.displayPhoneNumber })
    .from(whatsappConnections)
    .where(
      and(
        eq(whatsappConnections.organizationId, organizationId),
        eq(whatsappConnections.status, "connected"),
      ),
    )
    .limit(1);
  return row?.phone ?? null;
}

async function insert(values: typeof clientReports.$inferInsert) {
  // Written rather than defaulted: the two dialects spell `current_timestamp`
  // differently, and this column is compared and sorted as a string.
  const [row] = await db
    .insert(clientReports)
    .values({ createdAt: now(), ...values })
    .returning();
  if (!row) throw new Error("The report could not be saved.");
  return row;
}

/**
 * This month's report for a project, if one exists.
 *
 * `createdAt` is ISO text, so the month is a prefix match on "YYYY-MM". A
 * report regenerated within the month replaces this row rather than adding
 * to the pile; a new month starts a new row.
 */
async function findInMonth(
  organizationId: string,
  projectId: string,
  yearMonth: string,
) {
  const [row] = await db
    .select({ id: clientReports.id })
    .from(clientReports)
    .where(
      and(
        eq(clientReports.organizationId, organizationId),
        eq(clientReports.projectId, projectId),
        like(clientReports.createdAt, `${yearMonth}-%`),
      ),
    )
    .orderBy(desc(clientReports.createdAt))
    .limit(1);
  return row ?? null;
}

async function replace(
  organizationId: string,
  id: string,
  values: {
    clientName: string;
    snapshotJson: string;
    generatedByUserId: string;
  },
) {
  const [row] = await db
    .update(clientReports)
    .set({ ...values, createdAt: now() })
    .where(
      and(
        eq(clientReports.organizationId, organizationId),
        eq(clientReports.id, id),
      ),
    )
    .returning();
  if (!row) throw new Error("The report could not be replaced.");
  return row;
}

async function latestForProject(organizationId: string, projectId: string) {
  const [row] = await db
    .select({ snapshotJson: clientReports.snapshotJson })
    .from(clientReports)
    .where(
      and(
        eq(clientReports.organizationId, organizationId),
        eq(clientReports.projectId, projectId),
      ),
    )
    .orderBy(desc(clientReports.createdAt))
    .limit(1);
  return row ?? null;
}

async function list(organizationId: string, limit = 50) {
  return db
    .select({
      id: clientReports.id,
      projectId: clientReports.projectId,
      clientName: clientReports.clientName,
      createdAt: clientReports.createdAt,
    })
    .from(clientReports)
    .where(eq(clientReports.organizationId, organizationId))
    .orderBy(desc(clientReports.createdAt))
    .limit(limit);
}

async function get(organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(clientReports)
    .where(
      and(
        eq(clientReports.organizationId, organizationId),
        eq(clientReports.id, id),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function remove(organizationId: string, id: string) {
  await db
    .delete(clientReports)
    .where(
      and(
        eq(clientReports.organizationId, organizationId),
        eq(clientReports.id, id),
      ),
    );
}

/** The form as it was last submitted for this project, if ever. */
async function getProfile(organizationId: string, projectId: string) {
  const [row] = await db
    .select({ profileJson: clientReportProfiles.profileJson })
    .from(clientReportProfiles)
    .where(
      and(
        eq(clientReportProfiles.organizationId, organizationId),
        eq(clientReportProfiles.projectId, projectId),
      ),
    )
    .limit(1);
  return row?.profileJson ?? null;
}

async function saveProfile(input: {
  organizationId: string;
  projectId: string;
  profileJson: string;
}) {
  const updatedAt = now();
  await db
    .insert(clientReportProfiles)
    .values({ id: crypto.randomUUID(), ...input, updatedAt })
    .onConflictDoUpdate({
      target: [
        clientReportProfiles.organizationId,
        clientReportProfiles.projectId,
      ],
      set: { profileJson: input.profileJson, updatedAt },
    });
}

export const ClientReportRepository = {
  getProfile,
  saveProfile,
  findInMonth,
  replace,
  latestForProject,
  reportableProjects,
  organizationName,
  whatsappNumber,
  insert,
  list,
  get,
  remove,
};

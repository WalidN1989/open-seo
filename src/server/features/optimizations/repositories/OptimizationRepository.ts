import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  optimizationComments,
  optimizationOpportunities,
  optimizationRevisions,
  user,
} from "@/db/schema";
import { LIVE_STATUSES } from "@/types/schemas/optimizations";

export type OptimizationOpportunityRow =
  typeof optimizationOpportunities.$inferSelect;
export type OptimizationCommentRow = typeof optimizationComments.$inferSelect;

function now() {
  return new Date().toISOString();
}

async function listByProject(
  organizationId: string,
  projectId: string,
  filters: { type?: string; status?: string; source?: string } = {},
) {
  const conditions = [
    eq(optimizationOpportunities.organizationId, organizationId),
    eq(optimizationOpportunities.projectId, projectId),
  ];
  if (filters.type) conditions.push(eq(optimizationOpportunities.type, filters.type));
  if (filters.status)
    conditions.push(eq(optimizationOpportunities.status, filters.status));
  if (filters.source)
    conditions.push(eq(optimizationOpportunities.source, filters.source));

  return db
    .select()
    .from(optimizationOpportunities)
    .where(and(...conditions))
    .orderBy(
      desc(optimizationOpportunities.score),
      desc(optimizationOpportunities.updatedAt),
    )
    .limit(200);
}

async function getById(organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(optimizationOpportunities)
    .where(
      and(
        eq(optimizationOpportunities.organizationId, organizationId),
        eq(optimizationOpportunities.id, id),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * The row a re-scan should fold into, if any.
 *
 * Only a live row counts: a published or rejected one is history, and the same
 * keyword coming round again after either is a genuinely new opportunity.
 */
async function findLiveMatch(input: {
  organizationId: string;
  projectId: string;
  type: string;
  keyword: string;
  target: string | null;
}) {
  const rows = await db
    .select()
    .from(optimizationOpportunities)
    .where(
      and(
        eq(optimizationOpportunities.organizationId, input.organizationId),
        eq(optimizationOpportunities.projectId, input.projectId),
        eq(optimizationOpportunities.type, input.type),
        eq(optimizationOpportunities.keyword, input.keyword),
        inArray(optimizationOpportunities.status, [...LIVE_STATUSES]),
      ),
    );
  return (
    rows.find(
      (row) => (row.targetUrl ?? row.proposedPath ?? null) === input.target,
    ) ?? null
  );
}

async function insert(
  values: typeof optimizationOpportunities.$inferInsert,
): Promise<OptimizationOpportunityRow> {
  const [row] = await db
    .insert(optimizationOpportunities)
    .values(values)
    .returning();
  return row!;
}

async function update(
  organizationId: string,
  id: string,
  patch: Partial<typeof optimizationOpportunities.$inferInsert>,
) {
  const [row] = await db
    .update(optimizationOpportunities)
    .set({ ...patch, updatedAt: now() })
    .where(
      and(
        eq(optimizationOpportunities.organizationId, organizationId),
        eq(optimizationOpportunities.id, id),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * The thread, oldest first, with the writer's name resolved.
 *
 * A left join rather than a lookup per row: a comment whose author has since
 * been removed from the organization still belongs in the thread.
 */
async function listComments(organizationId: string, opportunityId: string) {
  return db
    .select({
      id: optimizationComments.id,
      authorUserId: optimizationComments.authorUserId,
      authorRole: optimizationComments.authorRole,
      authorName: user.name,
      kind: optimizationComments.kind,
      body: optimizationComments.body,
      visibility: optimizationComments.visibility,
      createdAt: optimizationComments.createdAt,
    })
    .from(optimizationComments)
    .leftJoin(user, eq(user.id, optimizationComments.authorUserId))
    .where(
      and(
        eq(optimizationComments.organizationId, organizationId),
        eq(optimizationComments.opportunityId, opportunityId),
      ),
    )
    .orderBy(asc(optimizationComments.createdAt));
}

async function insertComment(
  values: typeof optimizationComments.$inferInsert,
) {
  const [row] = await db.insert(optimizationComments).values(values).returning();
  return row!;
}

async function insertRevision(
  values: typeof optimizationRevisions.$inferInsert,
) {
  const [row] = await db
    .insert(optimizationRevisions)
    .values(values)
    .returning();
  return row!;
}

async function listRevisions(organizationId: string, opportunityId: string) {
  return db
    .select()
    .from(optimizationRevisions)
    .where(
      and(
        eq(optimizationRevisions.organizationId, organizationId),
        eq(optimizationRevisions.opportunityId, opportunityId),
      ),
    )
    .orderBy(desc(optimizationRevisions.version));
}

export const OptimizationRepository = {
  listByProject,
  getById,
  findLiveMatch,
  insert,
  update,
  listComments,
  insertComment,
  listRevisions,
  insertRevision,
};

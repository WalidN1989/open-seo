import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { crmSourceCandidates, crmSourceRuns } from "@/db/schema";

export type CandidateDraft = {
  externalId: string;
  provider: string;
  companyName: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  category?: string | null;
  country?: string | null;
  industry?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  evidenceScore: number;
  profileUrl?: string | null;
  notes?: string | null;
};

async function createRun(
  organizationId: string,
  input: {
    provider: string;
    query: string;
    location?: string | null;
    startedByMemberId?: string | null;
  },
) {
  const [row] = await db
    .insert(crmSourceRuns)
    .values({
      id: crypto.randomUUID(),
      organizationId,
      provider: input.provider,
      query: input.query,
      location: input.location ?? null,
      startedByMemberId: input.startedByMemberId ?? null,
      status: "running",
    })
    .returning();
  return row;
}

async function completeRun(
  organizationId: string,
  runId: string,
  input: {
    status: "complete" | "error";
    error?: string | null;
    candidateCount?: number;
  },
) {
  const [row] = await db
    .update(crmSourceRuns)
    .set({
      status: input.status,
      error: input.error ?? null,
      ...(input.candidateCount === undefined
        ? {}
        : { candidateCount: input.candidateCount }),
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(crmSourceRuns.organizationId, organizationId),
        eq(crmSourceRuns.id, runId),
      ),
    )
    .returning();
  return row;
}

async function listRuns(organizationId: string, limit = 25) {
  return db
    .select()
    .from(crmSourceRuns)
    .where(eq(crmSourceRuns.organizationId, organizationId))
    .orderBy(desc(crmSourceRuns.createdAt))
    .limit(limit);
}

/**
 * Insert what the provider returned, skipping anything already seen.
 *
 * Idempotent on (organization, provider, external id): re-running the same
 * search must not create a second copy of a candidate someone has already
 * reviewed, and must never resurrect one that was rejected.
 */
async function insertCandidates(
  organizationId: string,
  runId: string,
  drafts: readonly CandidateDraft[],
) {
  if (drafts.length === 0) return { inserted: 0, skipped: 0 };
  const now = new Date().toISOString();
  const rows = await db
    .insert(crmSourceCandidates)
    .values(
      drafts.map((draft) => ({
        id: crypto.randomUUID(),
        organizationId,
        runId,
        ...draft,
        contactName: draft.contactName ?? null,
        email: draft.email ?? null,
        phone: draft.phone ?? null,
        website: draft.website ?? null,
        category: draft.category ?? null,
        country: draft.country ?? null,
        industry: draft.industry ?? null,
        rating: draft.rating ?? null,
        reviewCount: draft.reviewCount ?? null,
        profileUrl: draft.profileUrl ?? null,
        notes: draft.notes ?? null,
        updatedAt: now,
      })),
    )
    .onConflictDoNothing()
    .returning();
  return { inserted: rows.length, skipped: drafts.length - rows.length };
}

type CandidateStatus = "new" | "reviewing" | "promoted" | "rejected";

async function listCandidates(
  organizationId: string,
  filters: { runId?: string; status?: CandidateStatus; limit: number },
) {
  const where = [eq(crmSourceCandidates.organizationId, organizationId)];
  if (filters.runId) where.push(eq(crmSourceCandidates.runId, filters.runId));
  if (filters.status)
    where.push(eq(crmSourceCandidates.status, filters.status));
  return db
    .select()
    .from(crmSourceCandidates)
    .where(and(...where))
    .orderBy(
      desc(crmSourceCandidates.evidenceScore),
      desc(crmSourceCandidates.createdAt),
    )
    .limit(filters.limit);
}

async function getCandidate(organizationId: string, candidateId: string) {
  const [row] = await db
    .select()
    .from(crmSourceCandidates)
    .where(
      and(
        eq(crmSourceCandidates.organizationId, organizationId),
        eq(crmSourceCandidates.id, candidateId),
      ),
    )
    .limit(1);
  return row;
}

/**
 * Claim a candidate for promotion.
 *
 * The status guard is the idempotency lock: two clicks, or a retry after a
 * timeout, both try to move the same row out of an unpromoted state and only
 * one can win, so a candidate can never become two leads.
 */
async function claimForPromotion(organizationId: string, candidateId: string) {
  const [row] = await db
    .update(crmSourceCandidates)
    .set({ status: "reviewing", updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(crmSourceCandidates.organizationId, organizationId),
        eq(crmSourceCandidates.id, candidateId),
        inArray(crmSourceCandidates.status, ["new", "reviewing"]),
      ),
    )
    .returning();
  return row;
}

async function markPromoted(
  organizationId: string,
  candidateId: string,
  input: { leadId: string; reviewedByMemberId?: string | null },
) {
  const [row] = await db
    .update(crmSourceCandidates)
    .set({
      status: "promoted",
      leadId: input.leadId,
      reviewedByMemberId: input.reviewedByMemberId ?? null,
      reviewedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(crmSourceCandidates.organizationId, organizationId),
        eq(crmSourceCandidates.id, candidateId),
      ),
    )
    .returning();
  return row;
}

async function rejectCandidate(
  organizationId: string,
  candidateId: string,
  input: { reason?: string | null; reviewedByMemberId?: string | null },
) {
  const [row] = await db
    .update(crmSourceCandidates)
    .set({
      status: "rejected",
      rejectedReason: input.reason ?? null,
      reviewedByMemberId: input.reviewedByMemberId ?? null,
      reviewedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(crmSourceCandidates.organizationId, organizationId),
        eq(crmSourceCandidates.id, candidateId),
        // A promoted candidate already has a lead; rejecting it afterwards
        // would leave the lead orphaned from its origin.
        inArray(crmSourceCandidates.status, ["new", "reviewing"]),
      ),
    )
    .returning();
  return row;
}

async function releaseClaim(organizationId: string, candidateId: string) {
  await db
    .update(crmSourceCandidates)
    .set({ status: "new", updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(crmSourceCandidates.organizationId, organizationId),
        eq(crmSourceCandidates.id, candidateId),
        eq(crmSourceCandidates.status, "reviewing"),
      ),
    );
}

async function bumpPromotedCount(organizationId: string, runId: string) {
  const [run] = await db
    .select()
    .from(crmSourceRuns)
    .where(
      and(
        eq(crmSourceRuns.organizationId, organizationId),
        eq(crmSourceRuns.id, runId),
      ),
    )
    .limit(1);
  if (!run) return;
  await db
    .update(crmSourceRuns)
    .set({
      promotedCount: run.promotedCount + 1,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(crmSourceRuns.id, runId));
}

export const SourceRepository = {
  createRun,
  completeRun,
  listRuns,
  insertCandidates,
  listCandidates,
  getCandidate,
  claimForPromotion,
  markPromoted,
  rejectCandidate,
  releaseClaim,
  bumpPromotedCount,
};

import type { z } from "zod";
import { AppError } from "@/server/lib/errors";
import {
  OptimizationRepository as Repo,
  type OptimizationOpportunityRow,
} from "../repositories/OptimizationRepository";
import type {
  createOpportunitySchema,
  listOpportunitiesSchema,
  OptimizationStatus,
} from "@/types/schemas/optimizations";
import { canTransition, PUBLISHABLE_FROM } from "../stateMachine";

function assertTransition(
  row: OptimizationOpportunityRow,
  to: OptimizationStatus,
) {
  const from = row.status as OptimizationStatus;
  if (!canTransition(from, to)) {
    throw new AppError(
      "VALIDATION_ERROR",
      `An opportunity that is ${from.replace("_", " ")} cannot become ${to.replace("_", " ")}.`,
    );
  }
}

async function requireOpportunity(organizationId: string, id: string) {
  const row = await Repo.getById(organizationId, id);
  if (!row) throw new AppError("NOT_FOUND", "Opportunity not found.");
  return row;
}

/**
 * What a JSON column can hold, spelled out rather than left as `unknown`.
 *
 * Server functions serialize their return value and reject `unknown`, so the
 * snapshots need a type the serializer can see through.
 */
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function parseJson(value: string | null): JsonValue {
  if (!value) return null;
  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    return null;
  }
}

/** Shape the UI reads. JSON columns are parsed once, here. */
function publicOpportunity(row: OptimizationOpportunityRow) {
  return {
    id: row.id,
    projectId: row.projectId,
    type: row.type,
    keyword: row.keyword,
    targetUrl: row.targetUrl,
    proposedPath: row.proposedPath,
    source: row.source,
    score: row.score,
    gscSnapshot: parseJson(row.gscSnapshotJson),
    serpSnapshot: parseJson(row.serpSnapshotJson),
    strengths: row.strengths,
    weaknesses: row.weaknesses,
    recommendedAction: row.recommendedAction,
    brief: parseJson(row.briefJson),
    draft: parseJson(row.draftJson),
    draftVersion: row.draftVersion,
    cms: row.cms,
    cmsTarget: parseJson(row.cmsTargetJson),
    status: row.status as OptimizationStatus,
    createdBy: row.createdBy,
    creditsUsed: row.creditsUsed,
    approvedByUserId: row.approvedByUserId,
    approvedAt: row.approvedAt,
    publishedAt: row.publishedAt,
    publishError: row.publishError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export type PublicOpportunity = ReturnType<typeof publicOpportunity>;

async function list(
  organizationId: string,
  projectId: string,
  // The project is already an argument; asking for it twice invites them to
  // disagree.
  filters: Omit<z.infer<typeof listOpportunitiesSchema>, "projectId">,
) {
  const rows = await Repo.listByProject(organizationId, projectId, filters);
  return rows.map(publicOpportunity);
}

async function detail(organizationId: string, opportunityId: string) {
  const row = await requireOpportunity(organizationId, opportunityId);
  const [comments, revisions] = await Promise.all([
    Repo.listComments(organizationId, opportunityId),
    Repo.listRevisions(organizationId, opportunityId),
  ]);
  return {
    opportunity: publicOpportunity(row),
    // The client-facing thread. Internal working notes stay internal.
    comments: comments
      .filter((comment) => comment.visibility === "client")
      .map((comment) => ({
        id: comment.id,
        authorRole: comment.authorRole,
        body: comment.body,
        createdAt: comment.createdAt,
      })),
    revisions: revisions.map((revision) => ({
      version: revision.version,
      draft: parseJson(revision.draftJson),
      createdAt: revision.createdAt,
    })),
  };
}

/**
 * Create, or fold new evidence into the live row for the same idea.
 *
 * A weekly scan finds the same striking-distance keyword every week; folding
 * keeps one thread of work with its brief, draft and comments intact instead of
 * burying the queue in copies.
 */
async function create(
  organizationId: string,
  projectId: string,
  input: z.infer<typeof createOpportunitySchema>,
  createdBy: "agent" | "user",
) {
  const target = input.targetUrl ?? input.proposedPath ?? null;
  const existing = await Repo.findLiveMatch({
    organizationId,
    projectId,
    type: input.type,
    keyword: input.keyword,
    target,
  });

  const evidence = {
    score: input.score,
    gscSnapshotJson: input.gscSnapshot
      ? JSON.stringify(input.gscSnapshot)
      : null,
    serpSnapshotJson: input.serpSnapshot
      ? JSON.stringify(input.serpSnapshot)
      : null,
    strengths: input.strengths ?? null,
    weaknesses: input.weaknesses ?? null,
  };

  if (existing) {
    const row = await Repo.update(organizationId, existing.id, evidence);
    return publicOpportunity(row ?? existing);
  }

  const row = await Repo.insert({
    id: crypto.randomUUID(),
    organizationId,
    projectId,
    type: input.type,
    keyword: input.keyword,
    targetUrl: input.targetUrl ?? null,
    proposedPath: input.proposedPath ?? null,
    source: input.source,
    recommendedAction: input.recommendedAction,
    cms: input.cms,
    status: "detected",
    createdBy,
    ...evidence,
  });
  return publicOpportunity(row);
}

/**
 * Attach the brief the agent wrote.
 *
 * Re-briefing something already briefed is allowed and is not a transition —
 * an agent revising its own thinking should not be an error.
 */
async function attachBrief(
  organizationId: string,
  opportunityId: string,
  brief: unknown,
) {
  const row = await requireOpportunity(organizationId, opportunityId);
  if (row.status !== "briefed") assertTransition(row, "briefed");
  const updated = await Repo.update(organizationId, opportunityId, {
    briefJson: JSON.stringify(brief),
    status: "briefed",
  });
  return publicOpportunity(updated ?? row);
}

/**
 * Attach a draft and keep the previous one.
 *
 * Every draft is written to the revision history before it replaces the
 * current one, so a reviewer can always see what changed after asking for
 * changes. Landing on `drafted` deliberately does NOT show it to a client;
 * staff still have to submit it.
 */
async function attachDraft(
  organizationId: string,
  opportunityId: string,
  draft: unknown,
) {
  const row = await requireOpportunity(organizationId, opportunityId);
  if (row.status !== "drafted") assertTransition(row, "drafted");
  const version = row.draftVersion + 1;
  const draftJson = JSON.stringify(draft);
  await Repo.insertRevision({
    id: crypto.randomUUID(),
    organizationId,
    opportunityId,
    version,
    draftJson,
  });
  const updated = await Repo.update(organizationId, opportunityId, {
    draftJson,
    draftVersion: version,
    status: "drafted",
  });
  return publicOpportunity(updated ?? row);
}

/** A note from the agent. Internal unless it is explicitly for the client. */
async function appendComment(input: {
  organizationId: string;
  opportunityId: string;
  body: string;
  visibility: "client" | "internal";
}) {
  await requireOpportunity(input.organizationId, input.opportunityId);
  await Repo.insertComment({
    id: crypto.randomUUID(),
    organizationId: input.organizationId,
    opportunityId: input.opportunityId,
    authorUserId: null,
    authorRole: "agent",
    body: input.body,
    visibility: input.visibility,
  });
  return { ok: true as const };
}

/**
 * What the client asked to be changed, so the agent can act on it.
 *
 * Returns only opportunities waiting on a revision, each with the comments
 * that explain what to fix.
 */
async function feedback(organizationId: string, projectId: string) {
  const rows = await Repo.listByProject(organizationId, projectId, {
    status: "changes_requested",
  });
  return Promise.all(
    rows.map(async (row) => {
      const comments = await Repo.listComments(organizationId, row.id);
      return {
        opportunity: publicOpportunity(row),
        comments: comments
          .filter((comment) => comment.visibility === "client")
          .map((comment) => ({
            authorRole: comment.authorRole,
            body: comment.body,
            createdAt: comment.createdAt,
          })),
      };
    }),
  );
}

/** Staff put a draft in front of the client. Requires `manage`. */
async function submitForReview(organizationId: string, opportunityId: string) {
  const row = await requireOpportunity(organizationId, opportunityId);
  assertTransition(row, "awaiting_approval");
  const updated = await Repo.update(organizationId, opportunityId, {
    status: "awaiting_approval",
  });
  return publicOpportunity(updated ?? row);
}

/**
 * A person approves. There is deliberately no MCP tool that reaches this, so
 * no agent and no leaked API key can approve its own work — the capability is
 * absent rather than merely denied.
 */
async function approve(
  organizationId: string,
  userId: string,
  opportunityId: string,
) {
  const row = await requireOpportunity(organizationId, opportunityId);
  assertTransition(row, "approved");
  const updated = await Repo.update(organizationId, opportunityId, {
    status: "approved",
    approvedByUserId: userId,
    approvedAt: new Date().toISOString(),
  });
  return publicOpportunity(updated ?? row);
}

async function requestChanges(input: {
  organizationId: string;
  userId: string;
  opportunityId: string;
  body: string;
}) {
  const row = await requireOpportunity(input.organizationId, input.opportunityId);
  assertTransition(row, "changes_requested");
  await Repo.insertComment({
    id: crypto.randomUUID(),
    organizationId: input.organizationId,
    opportunityId: input.opportunityId,
    authorUserId: input.userId,
    authorRole: "user",
    body: input.body,
    // The whole point of this comment is that the agent and the client both
    // read it.
    visibility: "client",
  });
  const updated = await Repo.update(
    input.organizationId,
    input.opportunityId,
    { status: "changes_requested" },
  );
  return publicOpportunity(updated ?? row);
}

async function reject(organizationId: string, opportunityId: string) {
  const row = await requireOpportunity(organizationId, opportunityId);
  assertTransition(row, "rejected");
  const updated = await Repo.update(organizationId, opportunityId, {
    status: "rejected",
  });
  return publicOpportunity(updated ?? row);
}

/**
 * The gate every CMS adapter must pass through.
 *
 * Callers ask this before constructing an adapter, so a rejected or unreviewed
 * opportunity fails before any credential is read or any request is built.
 */
async function beginPublish(organizationId: string, opportunityId: string) {
  const row = await requireOpportunity(organizationId, opportunityId);
  if (row.status !== PUBLISHABLE_FROM) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Only an approved opportunity can be published.",
    );
  }
  if (row.cms === "manual") {
    throw new AppError(
      "VALIDATION_ERROR",
      "This opportunity has no connected CMS — publish it by hand from the approved content.",
    );
  }
  const updated = await Repo.update(organizationId, opportunityId, {
    status: "publishing",
  });
  return publicOpportunity(updated ?? row);
}

export const OptimizationService = {
  list,
  detail,
  create,
  attachBrief,
  attachDraft,
  appendComment,
  feedback,
  submitForReview,
  approve,
  requestChanges,
  reject,
  beginPublish,
  canTransition,
};

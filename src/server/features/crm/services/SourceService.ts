import type { z } from "zod";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { BusinessAuditRepository } from "@/server/features/business-modules/repositories/BusinessAuditRepository";
import { CrmService } from "./CrmService";
import { CrmRepository } from "../repositories/CrmRepository";
import { SourceRepository } from "../repositories/SourceRepository";
import {
  connectionFor,
  evidenceScore,
  runSourceSearch,
  toCandidates,
} from "../providers/sourceAdapters";
import {
  startApifyMapsSearch,
  readApifyMapsResults,
} from "@/server/features/communications/providers/integrations";
import type {
  listCandidatesSchema,
  promoteCandidateSchema,
  rejectCandidateSchema,
  startSourceRunSchema,
  createProspectSchema,
} from "@/types/schemas/sources";

async function audit(
  organizationId: string,
  userId: string,
  action: string,
  targetId: string,
  metadata?: Record<string, unknown>,
) {
  await BusinessAuditRepository.record({
    organizationId,
    actorUserId: userId,
    action,
    targetType: "source_candidate",
    targetId,
    metadata,
  });
}

async function getWorkspace(organizationId: string, userId: string) {
  await BusinessModuleService.requireAccess(organizationId, userId, "leads");
  const [runs, candidates] = await Promise.all([
    SourceRepository.listRuns(organizationId),
    SourceRepository.listCandidates(organizationId, { limit: 200 }),
  ]);
  return { runs, candidates };
}

async function listCandidates(
  organizationId: string,
  userId: string,
  input: z.infer<typeof listCandidatesSchema>,
) {
  await BusinessModuleService.requireAccess(organizationId, userId, "leads");
  return SourceRepository.listCandidates(organizationId, input);
}

/**
 * Run a provider search and record what came back.
 *
 * Candidates are written even when some were seen before: the insert is
 * idempotent on the provider's own id, so re-running a search tops up the
 * review queue rather than duplicating it or resurrecting rejected records.
 */
async function startRun(
  organizationId: string,
  userId: string,
  input: z.infer<typeof startSourceRunSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "leads",
    "manage",
  );
  const providerRun =
    input.provider === "apify"
      ? await startApifyMapsSearch(
          await connectionFor(organizationId, "apify"),
          input,
        )
      : null;
  const run = await SourceRepository.createRun(organizationId, {
    provider: input.provider,
    providerRunId: providerRun?.id,
    query: input.query,
    location: input.location,
  });
  if (!run) throw new Error("Could not start the search.");
  if (providerRun)
    return { runId: run.id, found: 0, inserted: 0, skipped: 0, pending: true };

  try {
    const drafts = await runSourceSearch(organizationId, input);
    const { inserted, skipped } = await SourceRepository.insertCandidates(
      organizationId,
      run.id,
      drafts,
    );
    await SourceRepository.completeRun(organizationId, run.id, {
      status: "complete",
      candidateCount: inserted,
    });
    return { runId: run.id, found: drafts.length, inserted, skipped };
  } catch (error) {
    const message =
      error instanceof Error ? error.message.slice(0, 300) : "Search failed";
    await SourceRepository.completeRun(organizationId, run.id, {
      status: "error",
      error: message,
    });
    throw error;
  }
}

async function refreshRun(
  organizationId: string,
  userId: string,
  runId: string,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "leads",
    "manage",
  );
  const run = await SourceRepository.getRun(organizationId, runId);
  if (!run || run.provider !== "apify" || !run.providerRunId)
    throw new Error("That Maps search was not found.");
  if (run.status === "complete")
    return { pending: false, inserted: 0, skipped: 0 };
  const result = await readApifyMapsResults(
    await connectionFor(organizationId, "apify"),
    run.providerRunId,
  );
  if (result.pending) return { pending: true, inserted: 0, skipped: 0 };
  const counts = await SourceRepository.insertCandidates(
    organizationId,
    run.id,
    toCandidates("apify", result.items, 100),
  );
  await SourceRepository.completeRun(organizationId, run.id, {
    status: "complete",
    candidateCount: counts.inserted + counts.skipped,
  });
  return { pending: false, ...counts };
}

async function createProspect(
  organizationId: string,
  userId: string,
  input: z.infer<typeof createProspectSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "leads",
    "manage",
  );
  const run = await SourceRepository.createRun(organizationId, {
    provider: "manual",
    query: input.companyName,
  });
  if (!run) throw new Error("Could not save this prospect.");
  // The source link (or business/contact identity) makes a retry deduplicate.
  const externalId =
    input.profileUrl ||
    [
      input.companyName,
      input.phone || input.email || input.website || input.country || "",
    ]
      .join("|")
      .toLowerCase();
  const result = await SourceRepository.insertCandidates(
    organizationId,
    run.id,
    [
      {
        ...input,
        externalId,
        provider: "manual",
        evidenceScore: evidenceScore(input),
      },
    ],
  );
  await SourceRepository.completeRun(organizationId, run.id, {
    status: "complete",
    candidateCount: result.inserted,
  });
  return result;
}

/**
 * Turn a reviewed candidate into a lead, with its company and contact.
 *
 * Idempotent by design. The claim is a conditional update that only an
 * unpromoted candidate can win, so a double click, or a retry after a
 * timeout, returns the lead that already exists instead of making a second
 * one. Nothing here happens automatically: a candidate becomes a lead only
 * because a person decided it should.
 */
async function promote(
  organizationId: string,
  userId: string,
  input: z.infer<typeof promoteCandidateSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "leads",
    "manage",
  );

  const existing = await SourceRepository.getCandidate(
    organizationId,
    input.candidateId,
  );
  if (!existing) throw new Error("That candidate was not found.");
  if (existing.status === "promoted" && existing.leadId) {
    return { leadId: existing.leadId, alreadyPromoted: true };
  }
  if (existing.status === "rejected") {
    throw new Error(
      "That candidate was rejected. Re-run the search to revisit it.",
    );
  }

  const claimed = await SourceRepository.claimForPromotion(
    organizationId,
    input.candidateId,
  );
  if (!claimed) {
    const current = await SourceRepository.getCandidate(
      organizationId,
      input.candidateId,
    );
    if (current?.status === "promoted" && current.leadId) {
      return { leadId: current.leadId, alreadyPromoted: true };
    }
    throw new Error("That candidate could not be promoted.");
  }

  let leadId: string;
  try {
    const stages = await CrmService.ensureStages(organizationId);
    const relations = {
      ...input,
      stageId:
        input.stageId ??
        stages.find((stage) => stage.name === "Qualified")?.id ??
        stages[0]?.id,
    };
    if (
      !(await CrmRepository.validateLeadRelations(organizationId, {
        stageId: relations.stageId,
        assignedMemberId: input.assignedMemberId,
      }))
    )
      throw new Error("Invalid lead stage or owner.");
    const result = await SourceRepository.convertClaimed(
      organizationId,
      claimed,
      relations,
    );
    leadId = result.leadId;
  } catch (error) {
    await SourceRepository.releaseClaim(organizationId, input.candidateId);
    throw error;
  }
  // Audit failure must never release a successfully converted prospect.
  await audit(organizationId, userId, "source.candidate.promoted", claimed.id, {
    leadId,
    provider: claimed.provider,
  });
  return { leadId, alreadyPromoted: false };
}

async function reject(
  organizationId: string,
  userId: string,
  input: z.infer<typeof rejectCandidateSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "leads",
    "manage",
  );
  const row = await SourceRepository.rejectCandidate(
    organizationId,
    input.candidateId,
    { reason: input.reason },
  );
  if (!row) throw new Error("That candidate could not be rejected.");
  await audit(organizationId, userId, "source.candidate.rejected", row.id, {
    reason: input.reason ?? null,
  });
  return { id: row.id };
}

export const SourceService = {
  createProspect,
  refreshRun,
  getWorkspace,
  listCandidates,
  startRun,
  promote,
  reject,
};

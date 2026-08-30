import type { z } from "zod";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { BusinessAuditRepository } from "@/server/features/business-modules/repositories/BusinessAuditRepository";
import { CrmRepository } from "../repositories/CrmRepository";
import { SourceRepository } from "../repositories/SourceRepository";
import { runSourceSearch } from "../providers/sourceAdapters";
import type {
  listCandidatesSchema,
  promoteCandidateSchema,
  rejectCandidateSchema,
  startSourceRunSchema,
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
  const run = await SourceRepository.createRun(organizationId, {
    provider: input.provider,
    query: input.query,
    location: input.location,
  });
  if (!run) throw new Error("Could not start the search.");

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

  try {
    const company = await CrmRepository.createCompany(organizationId, {
      name: claimed.companyName,
      website: claimed.website ?? undefined,
      phone: claimed.phone ?? undefined,
      industry: claimed.industry ?? undefined,
      country: claimed.country ?? undefined,
    });

    // A contact is only created when the source actually found a person;
    // inventing "Unknown" would put a fake name in front of a salesperson.
    const contact = claimed.contactName
      ? await CrmRepository.createContact(organizationId, {
          companyId: company?.id,
          firstName: claimed.contactName.split(" ")[0] || claimed.contactName,
          lastName:
            claimed.contactName.split(" ").slice(1).join(" ") || undefined,
          email: claimed.email ?? undefined,
          phone: claimed.phone ?? undefined,
        })
      : null;

    const lead = await CrmRepository.createLead(organizationId, {
      title: claimed.companyName,
      companyId: company?.id,
      contactId: contact?.id,
      stageId: input.stageId,
      assignedMemberId: input.assignedMemberId,
      source: claimed.provider,
      category: claimed.category ?? undefined,
      priority: "medium",
      valueCents: 0,
      leadScore: claimed.evidenceScore,
      notes: claimed.notes ?? undefined,
    });
    if (!lead) throw new Error("Could not create the lead.");

    await SourceRepository.markPromoted(organizationId, input.candidateId, {
      leadId: lead.id,
      reviewedByMemberId: input.reviewedByMemberId,
    });
    await SourceRepository.bumpPromotedCount(organizationId, claimed.runId);
    await audit(
      organizationId,
      userId,
      "source.candidate.promoted",
      claimed.id,
      {
        leadId: lead.id,
        provider: claimed.provider,
      },
    );
    return { leadId: lead.id, alreadyPromoted: false };
  } catch (error) {
    // Put it back in the queue rather than leaving it stuck in review with no
    // lead to show for it.
    await SourceRepository.releaseClaim(organizationId, input.candidateId);
    throw error;
  }
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
    { reason: input.reason, reviewedByMemberId: input.reviewedByMemberId },
  );
  if (!row) throw new Error("That candidate could not be rejected.");
  await audit(organizationId, userId, "source.candidate.rejected", row.id, {
    reason: input.reason ?? null,
  });
  return { id: row.id };
}

export const SourceService = {
  getWorkspace,
  listCandidates,
  startRun,
  promote,
  reject,
};

import { AuthRepository } from "@/server/auth/repositories/AuthRepository";
import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";
import { AuditSummaryRepository } from "@/server/features/audit/repositories/AuditSummaryRepository";
import { SerpObservationRepository } from "@/server/features/competitors/repositories/SerpObservationRepository";
import { BacklinkSnapshotRepository } from "@/server/features/dashboard/repositories/BacklinkSnapshotRepository";
import { ProjectContextService } from "@/server/features/project-context/services/ProjectContextService";
import { ProjectService } from "@/server/features/projects/services/ProjectService";
import { RankTrackingService } from "@/server/features/rank-tracking/services/RankTrackingService";
import { VoiceGreetingService } from "./VoiceGreetingService";
import { moduleBrief } from "./moduleBrief";
import { cached } from "../cache";
import { resolveProject, type VoiceProject } from "../projectResolution";
import {
  renderProjectChoice,
  renderSeoBrief,
  type BriefRanking,
} from "../seoBrief";

/**
 * Every project this person may ask about: the projects of every organization
 * they belong to. The agency sees all of its clients; a client login belongs
 * to one organization and so hears only about its own site. The membership
 * is the boundary — there is no separate list to fall out of step with it.
 */
async function accessibleProjects(userId: string): Promise<VoiceProject[]> {
  return cached(`voice:projects:${userId}`, async () => {
    const organizationIds =
      await AuthRepository.listOrganizationIdsForUser(userId);
    const lists = await Promise.all(
      organizationIds.map((id) => ProjectService.listProjects(id)),
    );
    return lists.flat().map(({ id, name, domain }) => ({ id, name, domain }));
  });
}

/** A source that fails leaves its section empty rather than losing the answer. */
async function orNull<T>(read: Promise<T>): Promise<T | null> {
  try {
    return await read;
  } catch (error) {
    console.error("Voice analyst could not read a source", error);
    return null;
  }
}

async function latestAudit(projectId: string) {
  const audit = await AuditRepository.getLatestAuditForProject(projectId);
  if (!audit) return null;
  // Three columns, not every column of every page: the summary needs the
  // addresses and the issue types, and a spoken answer waits on this.
  const [issues, pages] = await Promise.all([
    AuditSummaryRepository.getIssueRowsForAudit(audit.id),
    AuditSummaryRepository.getPageUrlsForAudit(audit.id),
  ]);
  return {
    finishedAt: audit.completedAt ?? audit.startedAt,
    pagesCrawled: audit.pagesCrawled,
    pageUrls: pages.map((page) => page.url),
    issues,
  };
}

/** One row per keyword across every tracker, desktop first. */
async function trackedRankings(projectId: string): Promise<BriefRanking[]> {
  const configs = await RankTrackingService.getConfigs(projectId);
  const trackers = await Promise.all(
    configs.map((config) =>
      orNull(RankTrackingService.getTracker(config.id, projectId)),
    ),
  );
  const rows = new Map<string, BriefRanking>();
  for (const row of trackers.flatMap(
    (tracker) => tracker?.results.rows ?? [],
  )) {
    if (rows.has(row.keyword)) continue;
    const device = row.desktop.position !== null ? row.desktop : row.mobile;
    rows.set(row.keyword, {
      keyword: row.keyword,
      searchVolume: row.searchVolume,
      position: device.position,
      previousPosition: device.previousPosition,
    });
  }
  return [...rows.values()];
}

async function projectBrief(project: VoiceProject) {
  const [context, audit, rankings, backlinks, serp] = await Promise.all([
    orNull(ProjectContextService.getProjectContext(project.id)),
    orNull(latestAudit(project.id)),
    orNull(trackedRankings(project.id)),
    orNull(BacklinkSnapshotRepository.getLatestForProject(project.id)),
    orNull(SerpObservationRepository.listForProject(project.id)),
  ]);
  return renderSeoBrief({
    project,
    competitors: context?.competitors ?? [],
    audit,
    rankings: rankings ?? [],
    backlinks,
    serp: serp ?? [],
  });
}

/**
 * A project's brief is read once and reused for a few minutes. A spoken
 * conversation asks follow-up after follow-up about the same project, and
 * re-reading every audit page between two sentences is what made the agent
 * slow to answer. Audits and rank checks change on a scale of hours.
 */
async function cachedBrief(project: VoiceProject, organizationId: string) {
  return cached(`voice:brief:${organizationId}:${project.id}`, async () => {
    const [seo, modules] = await Promise.all([
      projectBrief(project),
      orNull(
        cached(`voice:modules:${organizationId}`, () =>
          moduleBrief(organizationId),
        ),
      ),
    ]);
    return modules ? `${seo}\n\nBusiness:\n${modules}` : seo;
  });
}

/**
 * The analyst's context for this turn: who is speaking, and the chosen
 * project's brief or the list to choose from when none is named yet.
 */
async function contextForTurn(
  organizationId: string,
  userId: string,
  userTurns: string[],
) {
  const [projects, speaker] = await Promise.all([
    accessibleProjects(userId),
    orNull(
      cached(`voice:speaker:${organizationId}:${userId}`, () =>
        VoiceGreetingService.speakerName(organizationId, userId),
      ),
    ),
  ]);
  const who = speaker ? `You are speaking with ${speaker}.\n` : "";
  const chosen = resolveProject(projects, userTurns);
  if (!chosen) return who + renderProjectChoice(projects);
  // Re-checked through the membership gate, not trusted from the list above.
  const allowed = await ProjectService.getProjectForMember(userId, chosen.id);
  if (!allowed) return who + renderProjectChoice(projects);
  return who + (await cachedBrief(chosen, allowed.organizationId));
}

/**
 * Read ahead while the greeting is still playing. The first question used to
 * pay for waking the database and reading the whole workspace; by the time
 * someone has finished asking it, that is already done.
 */
async function prewarm(organizationId: string, userId: string) {
  try {
    const [projects] = await Promise.all([
      accessibleProjects(userId),
      cached(`voice:speaker:${organizationId}:${userId}`, () =>
        VoiceGreetingService.speakerName(organizationId, userId),
      ),
      cached(`voice:modules:${organizationId}`, () =>
        moduleBrief(organizationId),
      ),
    ]);
    // Someone with one project will be asked about that project; anyone with
    // several names theirs first, so nothing else is read speculatively.
    const only = projects.length === 1 ? projects[0] : null;
    if (only) await cachedBrief(only, organizationId);
  } catch (error) {
    console.error("Voice prewarm failed", error);
  }
}

export const VoiceAnalystService = { contextForTurn, prewarm } as const;

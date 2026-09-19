import { AuthRepository } from "@/server/auth/repositories/AuthRepository";
import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";
import { SerpObservationRepository } from "@/server/features/competitors/repositories/SerpObservationRepository";
import { BacklinkSnapshotRepository } from "@/server/features/dashboard/repositories/BacklinkSnapshotRepository";
import { ProjectContextService } from "@/server/features/project-context/services/ProjectContextService";
import { ProjectService } from "@/server/features/projects/services/ProjectService";
import { RankTrackingService } from "@/server/features/rank-tracking/services/RankTrackingService";
import { moduleBrief } from "./moduleBrief";
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
  const organizationIds =
    await AuthRepository.listOrganizationIdsForUser(userId);
  const lists = await Promise.all(
    organizationIds.map((id) => ProjectService.listProjects(id)),
  );
  return lists.flat().map(({ id, name, domain }) => ({ id, name, domain }));
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
  const [issues, pages] = await Promise.all([
    AuditRepository.getIssuesForAudit(audit.id, {}),
    AuditRepository.getPagesForAudit(audit.id),
  ]);
  return {
    finishedAt: audit.completedAt ?? audit.startedAt,
    pagesCrawled: audit.pagesCrawled,
    pageUrls: pages.map((page) => page.url),
    issues: issues.map(({ issueType, severity, pageUrl }) => ({
      issueType,
      severity,
      pageUrl,
    })),
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
const BRIEF_TTL_MS = 5 * 60_000;
const briefs = new Map<string, { at: number; text: string }>();

async function cachedBrief(
  userId: string,
  project: VoiceProject,
  organizationId: string,
) {
  const key = `${userId}:${project.id}`;
  const hit = briefs.get(key);
  if (hit && Date.now() - hit.at < BRIEF_TTL_MS) return hit.text;
  const [seo, modules] = await Promise.all([
    projectBrief(project),
    orNull(moduleBrief(organizationId)),
  ]);
  const text = modules ? `${seo}\n\nBusiness:\n${modules}` : seo;
  if (briefs.size > 200) briefs.clear();
  briefs.set(key, { at: Date.now(), text });
  return text;
}

function firstName(name: string | null | undefined) {
  return name?.trim().split(/\s+/)[0] ?? "";
}

/**
 * The analyst's context for this turn: who is speaking, and the chosen
 * project's brief or the list to choose from when none is named yet.
 */
async function contextForTurn(userId: string, userTurns: string[]) {
  const [projects, user] = await Promise.all([
    accessibleProjects(userId),
    orNull(AuthRepository.getHostedUser(userId)),
  ]);
  const speaker = firstName(user?.name);
  const who = speaker ? `You are speaking with ${speaker}.\n` : "";
  const chosen = resolveProject(projects, userTurns);
  if (!chosen) return who + renderProjectChoice(projects);
  // Re-checked through the membership gate, not trusted from the list above.
  const allowed = await ProjectService.getProjectForMember(userId, chosen.id);
  if (!allowed) return who + renderProjectChoice(projects);
  return who + (await cachedBrief(userId, chosen, allowed.organizationId));
}

export const VoiceAnalystService = { contextForTurn } as const;

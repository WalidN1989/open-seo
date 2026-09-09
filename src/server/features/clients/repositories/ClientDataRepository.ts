import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  audits,
  auditIssues,
  backlinkSnapshots,
  keywordMetrics,
  optimizationOpportunities,
  projects,
  rankCheckRuns,
  rankSnapshots,
  rankTrackingConfigs,
  rankTrackingKeywords,
  savedKeywords,
} from "@/db/schema";

/**
 * Reads of one client's own data, for answering that client over WhatsApp.
 *
 * Every function here takes the client's organization id as its first
 * argument and every query is anchored to it through `projects`. There is no
 * function in this file that can be called without naming an organization,
 * and none that takes a project id on its own — a project id is a value the
 * caller could get wrong, an organization id is a value the caller was handed
 * by verification.
 *
 * Read-only by construction: no insert, update or delete, and nothing here
 * calls a vendor API, so a customer asking questions can never spend credits.
 */

/** The anchor. Everything else reads only within what this returns. */
async function projectsFor(clientOrganizationId: string) {
  return db
    .select({
      id: projects.id,
      name: projects.name,
      domain: projects.domain,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, clientOrganizationId),
        isNull(projects.archivedAt),
      ),
    )
    .orderBy(projects.name);
}

async function projectIdsFor(clientOrganizationId: string) {
  const rows = await projectsFor(clientOrganizationId);
  return rows.map((row) => row.id);
}

async function rankingsFor(clientOrganizationId: string) {
  const projectIds = await projectIdsFor(clientOrganizationId);
  if (!projectIds.length) return [];
  const runs = await db
    .select({
      id: rankCheckRuns.id,
      projectId: rankCheckRuns.projectId,
      completedAt: rankCheckRuns.completedAt,
    })
    .from(rankCheckRuns)
    .where(
      and(
        inArray(rankCheckRuns.projectId, projectIds),
        eq(rankCheckRuns.status, "completed"),
      ),
    )
    .orderBy(desc(rankCheckRuns.completedAt))
    .limit(2);
  const [latest, previous] = runs;
  if (!latest) return [];

  const rowsFor = (runId: string) =>
    db
      .select({
        keyword: rankSnapshots.keyword,
        position: rankSnapshots.position,
        url: rankSnapshots.url,
      })
      .from(rankSnapshots)
      .where(eq(rankSnapshots.runId, runId))
      .orderBy(rankSnapshots.position)
      .limit(40);

  const [current, before] = await Promise.all([
    rowsFor(latest.id),
    previous ? rowsFor(previous.id) : Promise.resolve([]),
  ]);
  const wasAt = new Map(before.map((row) => [row.keyword, row.position]));
  return current.map((row) => ({
    ...row,
    previousPosition: wasAt.get(row.keyword) ?? null,
    checkedAt: latest.completedAt,
  }));
}

async function trackedKeywordCount(clientOrganizationId: string) {
  const projectIds = await projectIdsFor(clientOrganizationId);
  if (!projectIds.length) return 0;
  const rows = await db
    .select({ id: rankTrackingKeywords.id })
    .from(rankTrackingKeywords)
    .innerJoin(
      rankTrackingConfigs,
      eq(rankTrackingConfigs.id, rankTrackingKeywords.configId),
    )
    .where(inArray(rankTrackingConfigs.projectId, projectIds));
  return rows.length;
}

async function keywordsFor(clientOrganizationId: string) {
  const projectIds = await projectIdsFor(clientOrganizationId);
  if (!projectIds.length) return [];
  return db
    .select({
      keyword: savedKeywords.keyword,
      searchVolume: keywordMetrics.searchVolume,
      difficulty: keywordMetrics.keywordDifficulty,
    })
    .from(savedKeywords)
    .leftJoin(
      keywordMetrics,
      and(
        eq(keywordMetrics.projectId, savedKeywords.projectId),
        eq(keywordMetrics.keyword, savedKeywords.keyword),
      ),
    )
    .where(inArray(savedKeywords.projectId, projectIds))
    .orderBy(desc(keywordMetrics.searchVolume))
    .limit(40);
}

async function backlinksFor(clientOrganizationId: string) {
  const projectIds = await projectIdsFor(clientOrganizationId);
  if (!projectIds.length) return [];
  return db
    .select({
      domain: backlinkSnapshots.domain,
      backlinks: backlinkSnapshots.backlinks,
      referringDomains: backlinkSnapshots.referringDomains,
      newBacklinks: backlinkSnapshots.newBacklinks,
      lostBacklinks: backlinkSnapshots.lostBacklinks,
      capturedAt: backlinkSnapshots.capturedAt,
    })
    .from(backlinkSnapshots)
    .where(inArray(backlinkSnapshots.projectId, projectIds))
    .orderBy(desc(backlinkSnapshots.capturedAt))
    .limit(4);
}

async function contentFor(clientOrganizationId: string) {
  const projectIds = await projectIdsFor(clientOrganizationId);
  if (!projectIds.length) return [];
  return db
    .select({
      type: optimizationOpportunities.type,
      keyword: optimizationOpportunities.keyword,
      targetUrl: optimizationOpportunities.targetUrl,
      status: optimizationOpportunities.status,
      updatedAt: optimizationOpportunities.updatedAt,
    })
    .from(optimizationOpportunities)
    .where(inArray(optimizationOpportunities.projectId, projectIds))
    .orderBy(desc(optimizationOpportunities.updatedAt))
    .limit(20);
}

async function siteHealthFor(clientOrganizationId: string) {
  const projectIds = await projectIdsFor(clientOrganizationId);
  if (!projectIds.length) return null;
  const [latest] = await db
    .select({
      id: audits.id,
      startUrl: audits.startUrl,
      pagesCrawled: audits.pagesCrawled,
      completedAt: audits.completedAt,
    })
    .from(audits)
    .where(
      and(
        inArray(audits.projectId, projectIds),
        eq(audits.status, "completed"),
      ),
    )
    .orderBy(desc(audits.completedAt))
    .limit(1);
  if (!latest) return null;
  const issues = await db
    .select({
      issueType: auditIssues.issueType,
      severity: auditIssues.severity,
    })
    .from(auditIssues)
    .where(eq(auditIssues.auditId, latest.id))
    .limit(500);
  return { audit: latest, issues };
}

export const ClientDataRepository = {
  projectsFor,
  rankingsFor,
  trackedKeywordCount,
  keywordsFor,
  backlinksFor,
  contentFor,
  siteHealthFor,
};

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { SerpObservationRepository } from "@/server/features/competitors/repositories/SerpObservationRepository";
import { rankCompetitors } from "@/server/features/competitors/rankCompetitors";
import {
  audits,
  auditIssues,
  backlinkSnapshots,
  ga4Connections,
  gscConnections,
  keywordMetrics,
  optimizationOpportunities,
  projectCompetitors,
  projects,
  rankCheckRuns,
  rankSnapshots,
  rankTrackingConfigs,
  rankTrackingKeywords,
  savedKeywords,
} from "@/db/schema";

/**
 * Everything one handover report reads, for one project.
 *
 * Reads only. The report is a picture of work already done, so nothing here
 * calls a vendor API or spends credits — generating a report for a client must
 * cost nothing, or it will not get done.
 */

async function project(projectId: string) {
  const [row] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return row ?? null;
}

/** Positions from the last finished check, with the one before for movement. */
async function rankings(projectId: string) {
  const runs = await db
    .select({ id: rankCheckRuns.id, completedAt: rankCheckRuns.completedAt })
    .from(rankCheckRuns)
    .where(
      and(
        eq(rankCheckRuns.projectId, projectId),
        eq(rankCheckRuns.status, "completed"),
      ),
    )
    .orderBy(desc(rankCheckRuns.completedAt))
    .limit(2);
  const [latest, previous] = runs;
  if (!latest) return { rows: [], checkedAt: null };

  const rowsFor = (runId: string) =>
    db
      .select({
        keyword: rankSnapshots.keyword,
        position: rankSnapshots.position,
      })
      .from(rankSnapshots)
      .where(eq(rankSnapshots.runId, runId))
      .orderBy(rankSnapshots.position);

  const [current, before] = await Promise.all([
    rowsFor(latest.id),
    previous ? rowsFor(previous.id) : Promise.resolve([]),
  ]);
  const wasAt = new Map(before.map((row) => [row.keyword, row.position]));
  const volumes = await db
    .select({
      keyword: rankTrackingKeywords.keyword,
      searchVolume: rankTrackingKeywords.searchVolume,
    })
    .from(rankTrackingKeywords)
    .innerJoin(
      rankTrackingConfigs,
      eq(rankTrackingConfigs.id, rankTrackingKeywords.configId),
    )
    .where(eq(rankTrackingConfigs.projectId, projectId));
  const volumeFor = new Map(
    volumes.map((row) => [row.keyword, row.searchVolume]),
  );

  return {
    checkedAt: latest.completedAt,
    rows: current.map((row) => ({
      keyword: row.keyword,
      position: row.position,
      previousPosition: wasAt.get(row.keyword) ?? null,
      searchVolume: volumeFor.get(row.keyword) ?? null,
    })),
  };
}

async function savedKeywordCount(projectId: string) {
  const rows = await db
    .select({ id: savedKeywords.id })
    .from(savedKeywords)
    .where(eq(savedKeywords.projectId, projectId));
  return rows.length;
}

/**
 * Keywords researched for this project, saved or not.
 *
 * Saving is a deliberate shortlisting step, so counting only saved keywords
 * reported "not started" for a project with a hundred and fifty researched.
 * The research is the work; the shortlist is what came after it.
 */
async function researchedKeywordCount(projectId: string) {
  const rows = await db
    .select({ id: keywordMetrics.id })
    .from(keywordMetrics)
    .where(eq(keywordMetrics.projectId, projectId));
  return rows.length;
}

/**
 * The best of what has been researched, for the client to confirm.
 *
 * Twenty is the most a person will read on a page and mark honestly. Sorted by
 * volume, because that is the one figure a client can react to without being
 * taught what difficulty means.
 */
async function topResearched(projectId: string) {
  return db
    .select({
      keyword: keywordMetrics.keyword,
      searchVolume: keywordMetrics.searchVolume,
      difficulty: keywordMetrics.keywordDifficulty,
    })
    .from(keywordMetrics)
    .where(eq(keywordMetrics.projectId, projectId))
    .orderBy(desc(keywordMetrics.searchVolume))
    .limit(20);
}

async function researchedVolume(projectId: string) {
  const rows = await db
    .select({ searchVolume: keywordMetrics.searchVolume })
    .from(keywordMetrics)
    .where(eq(keywordMetrics.projectId, projectId));
  return rows.reduce((total, row) => total + (row.searchVolume ?? 0), 0);
}

async function links(projectId: string) {
  const [row] = await db
    .select({
      backlinks: backlinkSnapshots.backlinks,
      referringDomains: backlinkSnapshots.referringDomains,
      capturedAt: backlinkSnapshots.capturedAt,
    })
    .from(backlinkSnapshots)
    .where(eq(backlinkSnapshots.projectId, projectId))
    .orderBy(desc(backlinkSnapshots.capturedAt))
    .limit(1);
  return row ?? null;
}

async function siteHealth(projectId: string) {
  const [latest] = await db
    .select({ id: audits.id, pagesCrawled: audits.pagesCrawled })
    .from(audits)
    .where(and(eq(audits.projectId, projectId), eq(audits.status, "completed")))
    .orderBy(desc(audits.completedAt))
    .limit(1);
  if (!latest) return null;
  const issues = await db
    .select({ severity: auditIssues.severity })
    .from(auditIssues)
    .where(eq(auditIssues.auditId, latest.id));
  const counts = new Map<string, number>();
  for (const issue of issues) {
    const key = issue.severity ?? "other";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return {
    pagesCrawled: latest.pagesCrawled ?? 0,
    issues: [...counts.entries()].map(([severity, count]) => ({
      severity,
      count,
    })),
  };
}

async function competitors(projectId: string) {
  return db
    .select({
      domain: projectCompetitors.domain,
      name: projectCompetitors.name,
    })
    .from(projectCompetitors)
    .where(eq(projectCompetitors.projectId, projectId))
    .orderBy(projectCompetitors.domain)
    .limit(8);
}

/**
 * The competitors the project's own SERPs show, when none were written down.
 *
 * Costs nothing: it reads results already fetched and paid for by keyword
 * research. A domain has to turn up for at least two of the project's keywords
 * before it is called a competitor, so a single stray result does not end up in
 * front of a client.
 */
async function observedCompetitors(
  projectId: string,
  ownDomain: string | null,
) {
  const observations =
    await SerpObservationRepository.listForProject(projectId);
  if (!observations.length) return [];
  return rankCompetitors(observations, {
    ownDomain,
    minKeywords: 2,
    limit: 6,
  });
}

async function contentCounts(projectId: string) {
  const rows = await db
    .select({ status: optimizationOpportunities.status })
    .from(optimizationOpportunities)
    .where(eq(optimizationOpportunities.projectId, projectId));
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
  }
  return [...counts.entries()].map(([status, count]) => ({ status, count }));
}

async function connections(projectId: string) {
  const [gsc, ga4] = await Promise.all([
    db
      .select({ siteUrl: gscConnections.siteUrl })
      .from(gscConnections)
      .where(eq(gscConnections.projectId, projectId))
      .limit(1),
    db
      .select({ id: ga4Connections.id })
      .from(ga4Connections)
      .where(eq(ga4Connections.projectId, projectId))
      .limit(1),
  ]);
  return {
    searchConsole: gsc[0]?.siteUrl ?? null,
    analytics: ga4.length > 0,
  };
}

export const ReportDataRepository = {
  project,
  observedCompetitors,
  rankings,
  savedKeywordCount,
  researchedKeywordCount,
  topResearched,
  researchedVolume,
  links,
  siteHealth,
  competitors,
  contentCounts,
  connections,
};

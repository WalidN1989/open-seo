import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  lte,
  max,
  min,
  or,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import { rankCheckRuns, rankSnapshots, rankCheckRunTargets } from "@/db/schema";
import { toRankTrackingTimestamp } from "@/server/features/rank-tracking/rankTrackingTimestamps";

function observationRunIdsForConfig(configId: string) {
  return db
    .select({ id: rankCheckRuns.id })
    .from(rankCheckRuns)
    .where(
      and(
        eq(rankCheckRuns.configId, configId),
        or(
          eq(rankCheckRuns.status, "completed"),
          eq(rankCheckRuns.targetsPrepared, true),
        ),
      ),
    );
}

function cutoffTimestamp(sinceDays: number): string {
  return toRankTrackingTimestamp(
    new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000),
  );
}

/**
 * Flat per-keyword position series across reliable observations, ordered oldest first.
 * `null` position = checked but not found within serpDepth (a real event, not a
 * missing check). The client pivots these rows per device.
 */
export async function getKeywordHistory(
  configId: string,
  trackingKeywordId: string,
  sinceDays: number,
) {
  return db
    .select({
      device: rankSnapshots.device,
      checkedAt: rankSnapshots.checkedAt,
      position: rankSnapshots.position,
    })
    .from(rankSnapshots)
    .where(
      and(
        inArray(rankSnapshots.runId, observationRunIdsForConfig(configId)),
        eq(rankSnapshots.trackingKeywordId, trackingKeywordId),
        gte(rankSnapshots.checkedAt, cutoffTimestamp(sinceDays)),
      ),
    )
    .orderBy(asc(rankSnapshots.checkedAt));
}

/**
 * Per-run keyword-position distribution for one device, oldest first. Grouped
 * by runId (not checkedAt — snapshots in a run don't share an exact insert
 * time); the run's startedAt is the x-axis timestamp. The buckets are disjoint
 * and cover every tracked keyword: a position past 20, or null (not found in
 * the tracked depth), falls into "not ranking" (derived from `total`).
 */
export async function getConfigTrend(
  configId: string,
  device: "desktop" | "mobile",
  sinceDays: number,
) {
  return db
    .select({
      runId: rankCheckRuns.id,
      checkedAt: rankCheckRuns.startedAt,
      total: count(rankSnapshots.id),
      intendedTotal: sql<
        number | null
      >`case when ${rankCheckRuns.targetsPrepared} then (select count(*) from ${rankCheckRunTargets} where ${rankCheckRunTargets.runId} = ${rankCheckRuns.id} and ${rankCheckRunTargets.device} = ${device}) else null end`,
      top3: sql<number>`sum(case when ${rankSnapshots.position} between 1 and 3 then 1 else 0 end)`,
      top4to10: sql<number>`sum(case when ${rankSnapshots.position} between 4 and 10 then 1 else 0 end)`,
      top11to20: sql<number>`sum(case when ${rankSnapshots.position} between 11 and 20 then 1 else 0 end)`,
    })
    .from(rankCheckRuns)
    .leftJoin(
      rankSnapshots,
      and(
        eq(rankSnapshots.runId, rankCheckRuns.id),
        eq(rankSnapshots.device, device),
      ),
    )
    .where(
      and(
        eq(rankCheckRuns.configId, configId),
        inArray(rankCheckRuns.status, ["completed", "failed"]),
        or(
          eq(rankCheckRuns.status, "completed"),
          eq(rankCheckRuns.targetsPrepared, true),
        ),
        eq(rankCheckRuns.isSubsetRun, false),
        gte(rankCheckRuns.startedAt, cutoffTimestamp(sinceDays)),
      ),
    )
    .groupBy(
      rankCheckRuns.id,
      rankCheckRuns.startedAt,
      rankCheckRuns.targetsPrepared,
    )
    .orderBy(asc(rankCheckRuns.startedAt));
}

/**
 * Recent per-keyword positions for one device as a flat list, for the "by date"
 * history matrix. Bounded to the last `runLimit` terminal runs; the client
 * pivots these into keyword rows × run (date) columns.
 */
export async function getPositionMatrix(
  configId: string,
  device: "desktop" | "mobile",
  runLimit: number,
) {
  const recentRunIds = db
    .select({ id: rankCheckRuns.id })
    .from(rankCheckRuns)
    .where(
      and(
        eq(rankCheckRuns.configId, configId),
        inArray(rankCheckRuns.status, ["completed", "failed"]),
        or(
          eq(rankCheckRuns.status, "completed"),
          eq(rankCheckRuns.targetsPrepared, true),
        ),
      ),
    )
    .orderBy(desc(rankCheckRuns.startedAt))
    .limit(runLimit);
  const [planned, legacy] = await Promise.all([
    db
      .select({
        runId: rankCheckRuns.id,
        checkedAt: rankCheckRuns.startedAt,
        trackingKeywordId: rankCheckRunTargets.trackingKeywordId,
        position: rankSnapshots.position,
        checked: sql<boolean>`${rankSnapshots.id} is not null`,
      })
      .from(rankCheckRunTargets)
      .innerJoin(rankCheckRuns, eq(rankCheckRunTargets.runId, rankCheckRuns.id))
      .leftJoin(
        rankSnapshots,
        and(
          eq(rankSnapshots.runId, rankCheckRunTargets.runId),
          eq(
            rankSnapshots.trackingKeywordId,
            rankCheckRunTargets.trackingKeywordId,
          ),
          eq(rankSnapshots.device, rankCheckRunTargets.device),
        ),
      )
      .where(
        and(
          inArray(rankCheckRunTargets.runId, recentRunIds),
          eq(rankCheckRunTargets.device, device),
        ),
      ),
    db
      .select({
        runId: rankCheckRuns.id,
        checkedAt: rankCheckRuns.startedAt,
        trackingKeywordId: rankSnapshots.trackingKeywordId,
        position: rankSnapshots.position,
      })
      .from(rankSnapshots)
      .innerJoin(rankCheckRuns, eq(rankSnapshots.runId, rankCheckRuns.id))
      .where(
        and(
          inArray(rankSnapshots.runId, recentRunIds),
          eq(rankSnapshots.device, device),
          eq(rankCheckRuns.targetsPrepared, false),
        ),
      ),
  ]);
  return [
    ...planned.map((row) => ({ ...row, checked: Boolean(row.checked) })),
    ...legacy.map((row) => ({ ...row, checked: true })),
  ].toSorted((a, b) => a.checkedAt.localeCompare(b.checkedAt));
}

/**
 * Pick one snapshot per keyword+device from eligible runs, using SQL GROUP BY
 * + self-join instead of loading all snapshots into JS memory.
 *
 * No keywordIds needed — scoped to the config via an eligible-runs subquery,
 * so subset runs are included automatically.
 */
export async function getSnapshotsForConfig(
  configId: string,
  opts: { beforeDate?: string; order: "latest" | "earliest" },
) {
  const completedRunIds = observationRunIdsForConfig(configId);

  const aggFn = opts.order === "latest" ? max : min;

  const conditions = [inArray(rankSnapshots.runId, completedRunIds)];
  if (opts.beforeDate) {
    conditions.push(lte(rankSnapshots.checkedAt, opts.beforeDate));
  }

  const grouped = db
    .select({
      trackingKeywordId: rankSnapshots.trackingKeywordId,
      device: rankSnapshots.device,
      targetCheckedAt: aggFn(rankSnapshots.checkedAt).as("target_checked_at"),
    })
    .from(rankSnapshots)
    .where(and(...conditions))
    .groupBy(rankSnapshots.trackingKeywordId, rankSnapshots.device)
    .as("grouped");

  return db
    .select({
      id: rankSnapshots.id,
      runId: rankSnapshots.runId,
      trackingKeywordId: rankSnapshots.trackingKeywordId,
      keyword: rankSnapshots.keyword,
      device: rankSnapshots.device,
      position: rankSnapshots.position,
      url: rankSnapshots.url,
      serpFeatures: rankSnapshots.serpFeatures,
      checkedAt: rankSnapshots.checkedAt,
    })
    .from(rankSnapshots)
    .innerJoin(
      grouped,
      and(
        eq(rankSnapshots.trackingKeywordId, grouped.trackingKeywordId),
        eq(rankSnapshots.device, grouped.device),
        eq(rankSnapshots.checkedAt, grouped.targetCheckedAt),
      ),
    )
    .where(inArray(rankSnapshots.runId, completedRunIds));
}

export async function getLatestSnapshotsForKeywords(configId: string) {
  return getSnapshotsForConfig(configId, { order: "latest" });
}

export async function getSnapshotsBeforeDate(
  configId: string,
  beforeDate: string,
) {
  return getSnapshotsForConfig(configId, { beforeDate, order: "latest" });
}

export async function getEarliestSnapshotsForKeywords(
  configId: string,
  keywordIds: string[],
) {
  if (keywordIds.length === 0) return [];

  const completedRunIds = observationRunIdsForConfig(configId);

  // D1 caps bound parameters at 100 per statement. The query binds N keyword
  // IDs plus 4 params from the completedRunIds subquery (referenced twice).
  // (Postgres allows far more, but the chunking is harmless there.)
  const CHUNK_SIZE = 90;
  const allResults: Awaited<ReturnType<typeof getSnapshotsForConfig>> = [];

  for (let i = 0; i < keywordIds.length; i += CHUNK_SIZE) {
    const chunk = keywordIds.slice(i, i + CHUNK_SIZE);

    const grouped = db
      .select({
        trackingKeywordId: rankSnapshots.trackingKeywordId,
        device: rankSnapshots.device,
        targetCheckedAt: min(rankSnapshots.checkedAt).as("target_checked_at"),
      })
      .from(rankSnapshots)
      .where(
        and(
          inArray(rankSnapshots.runId, completedRunIds),
          inArray(rankSnapshots.trackingKeywordId, chunk),
        ),
      )
      .groupBy(rankSnapshots.trackingKeywordId, rankSnapshots.device)
      .as("grouped");

    const rows = await db
      .select({
        id: rankSnapshots.id,
        runId: rankSnapshots.runId,
        trackingKeywordId: rankSnapshots.trackingKeywordId,
        keyword: rankSnapshots.keyword,
        device: rankSnapshots.device,
        position: rankSnapshots.position,
        url: rankSnapshots.url,
        serpFeatures: rankSnapshots.serpFeatures,
        checkedAt: rankSnapshots.checkedAt,
      })
      .from(rankSnapshots)
      .innerJoin(
        grouped,
        and(
          eq(rankSnapshots.trackingKeywordId, grouped.trackingKeywordId),
          eq(rankSnapshots.device, grouped.device),
          eq(rankSnapshots.checkedAt, grouped.targetCheckedAt),
        ),
      )
      .where(inArray(rankSnapshots.runId, completedRunIds));

    allResults.push(...rows);
  }

  return allResults;
}

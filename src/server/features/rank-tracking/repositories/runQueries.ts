import { and, asc, eq, inArray, sql, type InferInsertModel } from "drizzle-orm";
import { db } from "@/db";
import { rankCheckRuns, rankCheckRunTargets, rankSnapshots } from "@/db/schema";
import { runBatch } from "@/db/runBatch";

/** Serialize on the run row, freeze the whole plan atomically, then reuse it on replay. */
export async function prepareRunTargets(
  runId: string,
  keywords: Array<{ id: string; keyword: string }>,
  devices: "desktop" | "mobile" | "both",
) {
  const deviceList =
    devices === "both" ? (["desktop", "mobile"] as const) : [devices];
  const targets = keywords.flatMap((kw) =>
    deviceList.map((device) => ({
      runId,
      trackingKeywordId: kw.id,
      keyword: kw.keyword,
      device,
    })),
  );
  const active = and(
    eq(rankCheckRuns.id, runId),
    inArray(rankCheckRuns.status, ["pending", "running"]),
  );
  const unprepared = and(active, eq(rankCheckRuns.targetsPrepared, false));
  await runBatch((tx) => [
    // PostgreSQL holds this row lock until every target and the marker commit.
    tx.update(rankCheckRuns).set({ status: "running" }).where(active),
    ...targets.map((target) =>
      tx.insert(rankCheckRunTargets).select(
        tx
          .select({
            runId: sql<string>`${target.runId}`.as("runId"),
            trackingKeywordId: sql<string>`${target.trackingKeywordId}`.as(
              "trackingKeywordId",
            ),
            keyword: sql<string>`${target.keyword}`.as("keyword"),
            device: sql<"desktop" | "mobile">`${target.device}`.as("device"),
          })
          .from(rankCheckRuns)
          .where(unprepared),
      ),
    ),
    tx
      .update(rankCheckRuns)
      .set({ targetsPrepared: true, keywordsTotal: keywords.length })
      .where(unprepared),
  ]);
  const [run] = await db
    .select({ status: rankCheckRuns.status })
    .from(rankCheckRuns)
    .where(eq(rankCheckRuns.id, runId));
  return run && (run.status === "pending" || run.status === "running")
    ? getTargetsForRun(runId)
    : [];
}

export async function getTargetsForRun(runId: string) {
  return db
    .select()
    .from(rankCheckRunTargets)
    .where(eq(rankCheckRunTargets.runId, runId))
    .orderBy(
      asc(rankCheckRunTargets.trackingKeywordId),
      asc(rankCheckRunTargets.device),
    );
}

export async function getSnapshotsForRun(runId: string) {
  return db.select().from(rankSnapshots).where(eq(rankSnapshots.runId, runId));
}

/** Terminal decisions cannot be overwritten by a delayed progress/finalize/cleanup step. */
export async function updateRun(
  runId: string,
  data: Partial<InferInsertModel<typeof rankCheckRuns>>,
) {
  const rows = await db
    .update(rankCheckRuns)
    .set(data)
    .where(
      and(
        eq(rankCheckRuns.id, runId),
        inArray(rankCheckRuns.status, ["pending", "running"]),
      ),
    )
    .returning({ id: rankCheckRuns.id });
  return rows.length > 0;
}

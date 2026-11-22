import type { WorkflowStep } from "cloudflare:workers";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import {
  fetchRankCheckTaskResult,
  MAX_TASKS_PER_POST,
} from "@/server/lib/dataforseo";
import type {
  createDataforseoClient,
  PostedRankCheckTask,
  RankCheckResult,
  RankCheckTaskInput,
} from "@/server/lib/dataforseo";
import type { RankTrackingConfig } from "@/types/schemas/rank-tracking";
import { KEYWORDS_PER_BATCH } from "@/shared/rank-tracking";
import { pgStep } from "@/server/workflows/pgStep";

const SINGLE_ATTEMPT_STEP_CONFIG = {
  retries: { limit: 0, delay: "1 second" as const },
  timeout: "2 minutes" as const,
};

// A resolved Live SERP may take 260s; allow transport, metering and persistence.
const LIVE_STEP_CONFIG = {
  ...SINGLE_ATTEMPT_STEP_CONFIG,
  timeout: "6 minutes" as const,
};

type KeywordEntry = { id: string; keyword: string };
type RankCheckResultWithDevice = RankCheckResult & {
  device: "desktop" | "mobile";
};

function mapResultsToSnapshotRows(
  runId: string,
  results: RankCheckResultWithDevice[],
) {
  return results.map((r) => ({
    runId,
    trackingKeywordId: r.keywordId,
    keyword: r.keyword,
    device: r.device,
    position: r.position,
    url: r.url,
    serpFeatures:
      r.serpFeatures.length > 0 ? JSON.stringify(r.serpFeatures) : null,
  }));
}

interface CheckContext {
  client: ReturnType<typeof createDataforseoClient>;
  keywords: KeywordEntry[];
  devices: RankTrackingConfig["devices"];
  serpDepth: number;
  domain: string;
  locationCode: number;
  languageCode: string;
  locationName?: string;
  runId: string;
}

/** Expand keywords into one task input per keyword/device pair. */
function expandToTaskInputs(
  keywords: KeywordEntry[],
  devices: RankTrackingConfig["devices"],
): RankCheckTaskInput[] {
  const deviceList: Array<"desktop" | "mobile"> =
    devices === "both" ? ["desktop", "mobile"] : [devices];
  return keywords.flatMap((kw) =>
    deviceList.map((device) => ({
      keyword: kw.keyword,
      keywordId: kw.id,
      device,
    })),
  );
}

// ---------------------------------------------------------------------------
// Step bodies. Each runs inside a single step.do: inputs are its parameters,
// the return value is what the workflow engine persists and replays. They must
// not touch any mutable state outside their arguments.
// ---------------------------------------------------------------------------

/** Count keywords only after every requested device has a reliable response. */
async function updateProgress(ctx: CheckContext) {
  const snapshots = await RankTrackingRepository.getSnapshotsForRun(ctx.runId);
  const devices =
    ctx.devices === "both" ? ["desktop", "mobile"] : [ctx.devices];
  const pairs = new Set(
    snapshots.map(
      (snapshot) => `${snapshot.trackingKeywordId}:${snapshot.device}`,
    ),
  );
  await RankTrackingRepository.updateRun(ctx.runId, {
    keywordsChecked: ctx.keywords.filter((keyword) =>
      devices.every((device) => pairs.has(`${keyword.id}:${device}`)),
    ).length,
  });
}

/**
 * Check keyword/device pairs against the live endpoint and persist snapshots.
 * Per-call failures are logged and skipped (the metered client already charged
 * or refused each call individually). Returns the snapshot count written.
 */
async function checkBatchLive(
  ctx: CheckContext,
  tasks: RankCheckTaskInput[],
): Promise<number> {
  const settled = await Promise.allSettled(
    tasks.map((task) =>
      ctx.client.serp
        .rankCheck({
          keyword: task.keyword,
          keywordId: task.keywordId,
          locationCode: ctx.locationCode,
          languageCode: ctx.languageCode,
          locationName: ctx.locationName,
          device: task.device,
          targetDomain: ctx.domain,
          depth: ctx.serpDepth,
        })
        .then((r) => ({ ...r, device: task.device })),
    ),
  );
  const results: RankCheckResultWithDevice[] = [];
  for (const outcome of settled) {
    if (outcome.status === "fulfilled") {
      results.push(outcome.value);
    } else {
      console.error(
        `[rank-check] ${ctx.runId} live call failed:`,
        outcome.reason,
      );
    }
  }
  if (results.length > 0) {
    await RankTrackingRepository.insertSnapshots(
      mapResultsToSnapshotRows(ctx.runId, results),
    );
  }
  return results.length;
}

/**
 * Check keywords via Live API, parallel devices per keyword, real-time progress.
 * Snapshots are written incrementally after each batch so partial results
 * survive batch failures. Redirect resolution can take several minutes.
 * Billing is handled per-call by the metered client.
 */
export async function runLiveCheck(
  step: WorkflowStep,
  ctx: CheckContext,
): Promise<void> {
  for (let i = 0; i < ctx.keywords.length; i += KEYWORDS_PER_BATCH) {
    const keywordBatch = ctx.keywords.slice(i, i + KEYWORDS_PER_BATCH);
    const batchTasks = expandToTaskInputs(keywordBatch, ctx.devices);
    const batchIndex = Math.floor(i / KEYWORDS_PER_BATCH);

    await pgStep(
      step,
      `live-batch-${batchIndex}`,
      LIVE_STEP_CONFIG,
      async () => {
        const written = await checkBatchLive(ctx, batchTasks);
        await updateProgress(ctx);
        return written;
      },
    );
  }
}

// Poll cadence for queued tasks. Standard-priority tasks complete in ~5
// minutes on average, so the first check waits 4 minutes; cumulative waits are
// 4 / 6 / 8 / 10 / 12 / 15 minutes. Unfinished tasks remain unchecked;
// collection never launches an additional paid request.
const QUEUED_POLL_INTERVALS = [
  "4 minutes",
  "2 minutes",
  "2 minutes",
  "2 minutes",
  "2 minutes",
  "3 minutes",
] as const;

/** Concurrent task_get requests within a collect step. */
const TASK_GET_CONCURRENCY = 25;

/** Max task_get calls per persisted collect step. Every chunk is polled each round. */
const TASK_GETS_PER_COLLECT = 500;

// Collect steps may issue hundreds of task_get calls, so they get more room
// than SINGLE_ATTEMPT_STEP_CONFIG's 2-minute timeout. Unlike the metered
// steps, retrying is safe and free: task_get isn't charged and snapshot
// inserts are onConflictDoNothing.
const COLLECT_STEP_CONFIG = {
  retries: { limit: 2, delay: "10 seconds" as const },
  timeout: "5 minutes" as const,
};

interface CollectRoundOutcome {
  /** Snapshots written this round. */
  collected: number;
  /** Tasks still in DataForSEO's queue — poll again next round. */
  stillPending: PostedRankCheckTask[];
  /** Tasks DataForSEO failed; no additional paid call is made. */
  failed: PostedRankCheckTask[];
}

/**
 * Fetch results for queued tasks (one free task_get each), persist completed
 * snapshots, and update run progress. Transient task_get failures stay
 * pending for the next round.
 */
async function collectQueuedRound(
  ctx: CheckContext,
  tasks: PostedRankCheckTask[],
): Promise<CollectRoundOutcome> {
  const completed: RankCheckResultWithDevice[] = [];
  const stillPending: PostedRankCheckTask[] = [];
  const failed: PostedRankCheckTask[] = [];

  for (let i = 0; i < tasks.length; i += TASK_GET_CONCURRENCY) {
    const chunk = tasks.slice(i, i + TASK_GET_CONCURRENCY);
    const settled = await Promise.allSettled(
      chunk.map((task) =>
        fetchRankCheckTaskResult({
          taskId: task.taskId,
          keywordId: task.keywordId,
          keyword: task.keyword,
          targetDomain: ctx.domain,
        }),
      ),
    );
    settled.forEach((result, index) => {
      const task = chunk[index];
      if (result.status === "rejected") {
        // Transient fetch failure — try again next round.
        console.warn(
          `[rank-check] ${ctx.runId} task_get failed:`,
          result.reason,
        );
        stillPending.push(task);
      } else if (result.value.status === "pending") {
        stillPending.push(task);
      } else if (result.value.status === "failed") {
        console.warn(
          `[rank-check] ${ctx.runId} task ${task.taskId} failed: ${result.value.message}`,
        );
        failed.push(task);
      } else {
        completed.push({ ...result.value.result, device: task.device });
      }
    });
  }

  if (completed.length > 0) {
    await RankTrackingRepository.insertSnapshots(
      mapResultsToSnapshotRows(ctx.runId, completed),
    );
    await updateProgress(ctx);
  }

  return { collected: completed.length, stillPending, failed };
}

/** Per-run accounting for the queued path, in keyword/device task units. */
export interface QueuedCheckStats {
  /** Tasks accepted into DataForSEO's queue. */
  queueTasks: number;
  /** Task results collected from the queue within the polling window. */
  queueCollected: number;
  /** Retained for workflow log compatibility; additional paid fallbacks are disabled. */
  fallbackTasks: number;
  /** Always zero: no paid fallback is attempted. */
  fallbackChecked: number;
}

/**
 * Check keywords via DataForSEO's standard task queue (~30% of live cost).
 * Posts every keyword/device pair as a queued task, then polls task_get for
 * ~15 minutes, writing snapshots incrementally as tasks complete. Rejected,
 * failed, and unfinished tasks remain unchecked. Only task_post is billed;
 * no live fallback or paid retry is started.
 */
export async function runQueuedCheck(
  step: WorkflowStep,
  ctx: CheckContext,
): Promise<QueuedCheckStats> {
  const taskInputs = expandToTaskInputs(ctx.keywords, ctx.devices);

  // Post all tasks to the queue, <=100 per request, one metered step each.
  // A failed chunk must not abort the run — earlier chunks were already
  // charged at DataForSEO, so their results have to be collected. An exception
  // can also occur after provider charging; never repost or fall back to live.
  let pending: PostedRankCheckTask[] = [];
  for (let i = 0; i < taskInputs.length; i += MAX_TASKS_PER_POST) {
    const chunk = taskInputs.slice(i, i + MAX_TASKS_PER_POST);
    const postIndex = Math.floor(i / MAX_TASKS_PER_POST);
    let posted: PostedRankCheckTask[];
    try {
      posted = await pgStep(
        step,
        `post-tasks-${postIndex}`,
        SINGLE_ATTEMPT_STEP_CONFIG,
        async () =>
          ctx.client.serp.rankCheckTaskPost({
            tasks: chunk,
            locationCode: ctx.locationCode,
            languageCode: ctx.languageCode,
            locationName: ctx.locationName,
            depth: ctx.serpDepth,
            targetDomain: ctx.domain,
          }),
      );
    } catch (error) {
      console.warn(
        `[rank-check] ${ctx.runId} post-tasks-${postIndex} failed:`,
        error,
      );
      continue;
    }
    pending.push(...posted);
  }

  const stats: QueuedCheckStats = {
    queueTasks: pending.length,
    queueCollected: 0,
    fallbackTasks: 0,
    fallbackChecked: 0,
  };

  // Free collection continues even if a post or another collect step failed.
  // Poll every pending task each round so a slow first chunk cannot starve
  // later accepted, already-paid tasks.
  for (
    let round = 0;
    round < QUEUED_POLL_INTERVALS.length && pending.length > 0;
    round++
  ) {
    await step.sleep(`wait-${round}`, QUEUED_POLL_INTERVALS[round]);
    const nextPending: PostedRankCheckTask[] = [];
    for (
      let offset = 0;
      offset < pending.length;
      offset += TASK_GETS_PER_COLLECT
    ) {
      const batch = pending.slice(offset, offset + TASK_GETS_PER_COLLECT);
      const batchIndex = Math.floor(offset / TASK_GETS_PER_COLLECT);
      try {
        const outcome = await pgStep(
          step,
          `collect-${round}-${batchIndex}`,
          COLLECT_STEP_CONFIG,
          () => collectQueuedRound(ctx, batch),
        );
        stats.queueCollected += outcome.collected;
        nextPending.push(...outcome.stillPending);
      } catch (error) {
        console.warn(
          `[rank-check] ${ctx.runId} collect-${round}-${batchIndex} failed:`,
          error,
        );
        nextPending.push(...batch);
      }
    }
    pending = nextPending;
  }

  return stats;
}

import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import { withPgClient } from "@/db";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import { failRunIfActive } from "@/server/features/rank-tracking/services/rankCheckRunGuards";
import {
  runLiveCheck,
  runQueuedCheck,
  type QueuedCheckStats,
} from "@/server/workflows/rankCheckPaths";
import { pgStep } from "@/server/workflows/pgStep";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { captureServerEvent } from "@/server/lib/posthog";
import { AppError } from "@/server/lib/errors";
import { autumn } from "@/server/billing/autumn";
import {
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
} from "@/shared/billing";
import {
  estimateRankCheckCredits,
  rankCheckCostApprovalError,
} from "@/shared/rank-tracking";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";

const SINGLE_ATTEMPT_STEP_CONFIG = {
  retries: { limit: 0, delay: "1 second" as const },
  timeout: "2 minutes" as const,
};

interface RankCheckParams {
  runId: string;
  configId: string;
  billingCustomer: BillingCustomerContext;
  projectId: string;
  domain: string;
  locationCode: number;
  languageCode: string;
  locationName?: string;
  devices: "both" | "desktop" | "mobile";
  serpDepth: number;
  trigger: "manual" | "scheduled";
  keywordIds?: string[];
  maxCostCredits?: number;
}

export async function prepareRankCheckKeywords(input: {
  runId: string;
  configId: string;
  billingCustomer: BillingCustomerContext;
  devices: RankCheckParams["devices"];
  serpDepth: number;
  trigger: RankCheckParams["trigger"];
  keywordIds?: string[];
  maxCostCredits?: number;
}) {
  // If stale-cleanup marked our run failed before we got here, bail out
  // rather than resurrecting a superseded run.
  const run = await RankTrackingRepository.getRunById(input.runId);
  if (!run || run.status === "failed" || run.status === "completed") {
    throw new NonRetryableError(
      `Run ${input.runId} is no longer active (status=${run?.status ?? "missing"})`,
    );
  }

  const frozenTargets = run.targetsPrepared
    ? await RankTrackingRepository.getTargetsForRun(input.runId)
    : null;
  let trackingKeywords = frozenTargets
    ? [
        ...new Map(
          frozenTargets.map((target) => [
            target.trackingKeywordId,
            { id: target.trackingKeywordId, keyword: target.keyword },
          ]),
        ).values(),
      ]
    : await RankTrackingRepository.getKeywordsForConfig(input.configId);

  if (!frozenTargets && input.keywordIds && input.keywordIds.length > 0) {
    const idSet = new Set(input.keywordIds);
    trackingKeywords = trackingKeywords.filter((kw) => idSet.has(kw.id));
  }

  if (trackingKeywords.length === 0) {
    throw new AppError("INTERNAL_ERROR", "No keywords to track");
  }

  const targets = await RankTrackingRepository.prepareRunTargets(
    input.runId,
    trackingKeywords,
    input.devices,
  );
  if (targets.length === 0) {
    throw new NonRetryableError("Rank check is no longer active");
  }
  const preparedKeywords = [
    ...new Map(
      targets.map((target) => [
        target.trackingKeywordId,
        { id: target.trackingKeywordId, keyword: target.keyword },
      ]),
    ).values(),
  ];
  const { costCredits } = estimateRankCheckCredits(
    preparedKeywords.map((keyword) => keyword.keyword),
    input.devices,
    input.serpDepth,
    input.trigger === "scheduled" ? "queued" : "live",
  );
  if (input.maxCostCredits != null && costCredits > input.maxCostCredits) {
    throw new AppError(
      "VALIDATION_ERROR",
      rankCheckCostApprovalError(costCredits, input.maxCostCredits),
    );
  }

  // Verify the user has enough credits for the full check before starting.
  // Scheduled checks go through the cheaper task queue, so estimate at queued
  // pricing — a live-price estimate would skip checks the user can afford.
  if (await isHostedServerAuthMode()) {
    const [monthlyCheck, topupCheck] = await Promise.all([
      autumn.check({
        customerId: input.billingCustomer.organizationId,
        featureId: AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
      }),
      autumn.check({
        customerId: input.billingCustomer.organizationId,
        featureId: AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
      }),
    ]);
    const available =
      (monthlyCheck.balance?.remaining ?? 0) +
      (topupCheck.balance?.remaining ?? 0);
    if (available < costCredits) {
      throw new AppError(
        "INSUFFICIENT_CREDITS",
        "Insufficient credits for rank check",
      );
    }
  }

  return { keywords: preparedKeywords };
}

export async function finalizeRankCheckRun(input: {
  runId: string;
  configId: string;
  projectId: string;
  billingCustomer: BillingCustomerContext;
  trigger: RankCheckParams["trigger"];
  batchError: string | null;
  queueStats: QueuedCheckStats | null;
}) {
  // If stale-cleanup already marked our run failed, don't overwrite that
  // decision with a completed status — a replacement run may already be
  // underway.
  const run = await RankTrackingRepository.getRunById(input.runId);
  if (!run || run.status === "failed" || run.status === "completed") {
    console.warn(
      `[rank-check] ${input.runId} no longer active (status=${run?.status ?? "missing"}), skipping finalization`,
    );
    return;
  }

  const nowIso = new Date().toISOString();

  // Snapshots were written incrementally by each batch step.
  // Count from DB to get the authoritative keyword count.
  const snapshots = await RankTrackingRepository.getSnapshotsForRun(
    input.runId,
  );
  const targets = run.targetsPrepared
    ? await RankTrackingRepository.getTargetsForRun(input.runId)
    : [];
  const checkedPairs = new Set(
    snapshots.map((s) => `${s.trackingKeywordId}:${s.device}`),
  );
  const intendedPairs = targets.length;
  const checkedCount = targets.filter((t) =>
    checkedPairs.has(`${t.trackingKeywordId}:${t.device}`),
  ).length;
  const incompleteKeywords = new Set(
    targets
      .filter(
        (target) =>
          !checkedPairs.has(`${target.trackingKeywordId}:${target.device}`),
      )
      .map((target) => target.trackingKeywordId),
  );
  const keywordsChecked = run.targetsPrepared
    ? new Set(targets.map((target) => target.trackingKeywordId)).size -
      incompleteKeywords.size
    : new Set(snapshots.map((s) => s.trackingKeywordId)).size;
  const keywordsTotal = run.keywordsTotal || keywordsChecked;
  const incompleteCount = run.targetsPrepared
    ? intendedPairs - checkedCount
    : keywordsTotal - keywordsChecked;
  const unit = run.targetsPrepared ? "keyword/device check(s)" : "keyword(s)";
  const status = snapshots.length === 0 ? "failed" : "completed";
  let errorMessage: string | undefined;
  if (incompleteCount > 0 || status === "failed") {
    errorMessage = `${incompleteCount} ${unit} could not be checked. Previous reliable results are retained.`;
  }
  if (input.batchError) {
    errorMessage = `${errorMessage ?? "Some results were saved."} Error: ${input.batchError}`;
  }

  // Flipping status away from 'pending'/'running' is what releases the
  // partial-index slot for the next run.
  const finalized = await RankTrackingRepository.updateRun(input.runId, {
    status,
    keywordsChecked,
    completedAt: nowIso,
    ...(errorMessage ? { errorMessage } : {}),
  });
  if (!finalized) return;

  // Clear any previous skip reason on success.
  // Note: nextCheckAt is NOT set here — the cron handler advances it eagerly
  // before starting the workflow to prevent retry storms.
  if (snapshots.length > 0) {
    await RankTrackingRepository.updateConfig(input.configId, input.projectId, {
      lastCheckedAt: nowIso,
      lastSkipReason: null,
    });
  }

  // One-line summary per run for operational visibility.
  // Keys match the PostHog event properties for log/event correlation.
  const queueSummary = input.queueStats
    ? ` queue_tasks=${input.queueStats.queueTasks} queue_collected=${input.queueStats.queueCollected} fallback_tasks=${input.queueStats.fallbackTasks} fallback_checked=${input.queueStats.fallbackChecked}`
    : "";
  // Error text can echo vendor/user content — keep it one line and bounded.
  const errorSummary = errorMessage
    ? ` error="${errorMessage.replace(/\s+/g, " ").slice(0, 200)}"`
    : "";
  console.log(
    `[rank-check] ${input.runId} ${status} org=${input.billingCustomer.organizationId} project=${input.projectId} trigger=${input.trigger} keywords=${keywordsChecked}/${keywordsTotal}${queueSummary}${errorSummary}`,
  );

  await captureServerEvent({
    distinctId: input.billingCustomer.userId,
    event: "rank_tracking:check_complete",
    organizationId: input.billingCustomer.organizationId,
    properties: {
      project_id: input.projectId,
      status,
      checks_total: run.targetsPrepared ? intendedPairs : null,
      checks_completed: snapshots.length,
      trigger: input.trigger,
      keywords_checked: keywordsChecked,
      ...(input.queueStats
        ? {
            queue_tasks: input.queueStats.queueTasks,
            queue_collected: input.queueStats.queueCollected,
            fallback_tasks: input.queueStats.fallbackTasks,
            fallback_checked: input.queueStats.fallbackChecked,
          }
        : {}),
    },
  });
}

async function markRankCheckRunFailed(input: {
  runId: string;
  configId: string;
  projectId: string;
  billingCustomer: BillingCustomerContext;
  error: unknown;
}) {
  const errorMessage =
    input.error instanceof Error ? input.error.message : "Unknown error";
  await failRunIfActive(input.runId, errorMessage);

  // Flag the config so the UI can show why the scheduled check was skipped
  const isInsufficientCredits =
    input.error instanceof AppError &&
    input.error.code === "INSUFFICIENT_CREDITS";
  if (isInsufficientCredits) {
    await RankTrackingRepository.updateConfig(input.configId, input.projectId, {
      lastSkipReason: "insufficient_credits",
    });
  }

  await captureServerEvent({
    distinctId: input.billingCustomer.userId,
    event: "rank_tracking:check_complete",
    organizationId: input.billingCustomer.organizationId,
    properties: {
      project_id: input.projectId,
      status: "failed",
      error: errorMessage,
    },
  });
}

export class RankCheckWorkflow extends WorkflowEntrypoint<
  Env,
  RankCheckParams
> {
  async run(event: WorkflowEvent<RankCheckParams>, step: WorkflowStep) {
    // Scope a per-request Postgres client for this workflow invocation (no-op in
    // D1 mode). The socket is reclaimed when the invocation ends, so there is
    // nothing to tear down here.
    return withPgClient(() => this.runScoped(event, step));
  }

  private async runScoped(
    event: WorkflowEvent<RankCheckParams>,
    step: WorkflowStep,
  ) {
    const {
      runId,
      configId,
      billingCustomer,
      projectId,
      domain,
      locationCode,
      languageCode,
      locationName,
      devices,
      serpDepth,
      trigger,
      keywordIds,
      maxCostCredits,
    } = event.payload;

    // Guard: skip if config was archived after the workflow was triggered
    const configCheck = await pgStep(
      step,
      "check-active",
      { retries: { limit: 0, delay: "1 second" } },
      async () => {
        const cfg = await RankTrackingRepository.getConfigById({
          configId,
          projectId,
        });
        return { isActive: cfg?.isActive ?? false };
      },
    );
    if (!configCheck.isActive) {
      await failRunIfActive(runId, "Config has been archived");
      return;
    }

    try {
      console.log(
        `[rank-check] ${runId} starting (trigger=${trigger}, devices=${devices})`,
      );

      const prepareResult = await pgStep(
        step,
        "prepare",
        { retries: { limit: 0, delay: "1 second" } },
        async () =>
          prepareRankCheckKeywords({
            runId,
            configId,
            billingCustomer,
            devices,
            serpDepth,
            trigger,
            keywordIds,
            maxCostCredits,
          }),
      );

      const keywords = prepareResult.keywords;
      const client = createDataforseoClient(billingCustomer);

      console.log(`[rank-check] ${runId} loaded ${keywords.length} keywords`);

      let batchError: string | null = null;
      let queueStats: QueuedCheckStats | null = null;

      try {
        const checkContext = {
          client,
          keywords,
          devices,
          serpDepth,
          domain,
          locationCode,
          languageCode,
          locationName,
          runId,
        };
        // Scheduled checks use DataForSEO's task queue (~30% of live cost);
        // manual checks stay on the live endpoint for instant results.
        if (trigger === "scheduled") {
          queueStats = await runQueuedCheck(step, checkContext);
        } else {
          await runLiveCheck(step, checkContext);
        }
      } catch (error) {
        // Batch failure — snapshots for completed batches are already
        // persisted incrementally. Continue to finalization.
        batchError = error instanceof Error ? error.message : String(error);
        console.warn(`[rank-check] ${runId} partial failure: ${batchError}`);
      }

      await pgStep(step, "finalize", SINGLE_ATTEMPT_STEP_CONFIG, async () =>
        finalizeRankCheckRun({
          runId,
          configId,
          projectId,
          billingCustomer,
          trigger,
          batchError,
          queueStats,
        }),
      );
    } catch (error) {
      console.error(`Rank check ${runId} failed:`, error);
      await pgStep(step, "mark-failed", SINGLE_ATTEMPT_STEP_CONFIG, async () =>
        markRankCheckRunFailed({
          runId,
          configId,
          projectId,
          billingCustomer,
          error,
        }),
      );
      throw error;
    }
  }
}

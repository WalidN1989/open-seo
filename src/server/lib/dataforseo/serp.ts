import { z } from "zod";
import {
  SerpApiStopCrawlOnMatchInfo,
  SerpGoogleLocalFinderLiveAdvancedRequestInfo,
  SerpGoogleMapsLiveAdvancedRequestInfo,
  SerpGoogleOrganicLiveAdvancedRequestInfo,
  SerpGoogleOrganicTaskPostRequestInfo,
} from "dataforseo-client";
import { serpApi, serpTaskApi } from "@/server/lib/dataforseo/core";
import { MAX_TASKS_PER_POST } from "@/server/lib/dataforseo/shared";
import {
  assertOk,
  DataforseoChargedTaskError,
  buildTaskBilling,
  isNoResultsTask,
  isTaskInProgress,
  parseTaskItems,
  type DataforseoApiResponse,
  type DataforseoTaskLike,
} from "@/server/lib/dataforseo/envelope";
import { assertReliableRankUrl } from "./rankCheckUrl";
import { AppError } from "@/server/lib/errors";

/** DataForSEO bills SERPs in pages of 10; depth outside 10-100 is rejected. */
function clampSerpDepth(depth: number): number {
  return Math.min(100, Math.max(10, depth));
}

/**
 * Stop crawling SERP pages once the target domain is found — DataForSEO only
 * bills the pages crawled, so a page-1 ranking at depth 20 costs one page
 * instead of two. Matching is restricted to organic results and uses
 * with_subdomains, mirroring buildRankCheckResult exactly: without
 * find_targets_in, a sitelink or PAA mention could stop the crawl before the
 * domain's organic listing and record a false "not ranking".
 */
function stopCrawlOnTarget(targetDomain: string) {
  return {
    stop_crawl_on_match: [
      new SerpApiStopCrawlOnMatchInfo({
        match_value: targetDomain,
        match_type: "with_subdomains",
      }),
    ],
    find_targets_in: ["organic"],
  };
}

// Kept as a hand-written schema: the SDK's BaseSerpApiElementItem type omits
// etv / estimated_paid_traffic_cost / backlinks_info / rank_changes, which we
// rely on. The fields survive deserialization (the SDK copies unknown keys), so
// validating here is both our type-safety guard and how we read those fields.
const serpSnapshotItemSchema = z
  .object({
    type: z.string(),
    rank_group: z.number().nullable().optional(),
    rank_absolute: z.number().nullable().optional(),
    domain: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    breadcrumb: z.string().nullable().optional(),
    etv: z.number().nullable().optional(),
    estimated_paid_traffic_cost: z.number().nullable().optional(),
    backlinks_info: z
      .object({
        referring_domains: z.number().nullable().optional(),
        backlinks: z.number().nullable().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    rank_changes: z
      .object({
        previous_rank_absolute: z.number().nullable().optional(),
        is_new: z.boolean().nullable().optional(),
        is_up: z.boolean().nullable().optional(),
        is_down: z.boolean().nullable().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

export type SerpLiveItem = z.infer<typeof serpSnapshotItemSchema>;

export async function fetchLiveSerp(input: {
  keyword: string;
  locationCode: number;
  languageCode: string;
  depth?: number;
}): Promise<DataforseoApiResponse<SerpLiveItem[]>> {
  const response = await serpApi().googleOrganicLiveAdvanced([
    new SerpGoogleOrganicLiveAdvancedRequestInfo({
      keyword: input.keyword,
      location_code: input.locationCode,
      language_code: input.languageCode,
      device: "desktop",
      os: "windows",
      depth: clampSerpDepth(input.depth ?? 100),
    }),
  ]);
  const task = assertOk(response);
  return {
    data: parseTaskItems(
      "google-organic-live-advanced",
      task,
      serpSnapshotItemSchema,
    ),
    billing: buildTaskBilling(task),
  };
}

// A success status alone does not prove the SERP contains usable rankings.
// Keep this stricter boundary local to rank tracking; research can display
// partial SERPs without turning an absent listing into a ranking loss.
const rankCheckPayloadSchema = z.object({
  items: z.array(serpSnapshotItemSchema).min(1),
});

function rankCheckItems(task: DataforseoTaskLike): SerpLiveItem[] {
  // 40102 is the documented SERP status; retain the legacy 40501 response
  // only when its message explicitly identifies an empty search (not Invalid Field).
  if (
    (task.status_code === 40102 || task.status_code === 40501) &&
    isNoResultsTask(task)
  ) {
    return [];
  }
  if (task.status_code !== 20000) {
    throw new AppError(
      "INTERNAL_ERROR",
      "DataForSEO returned an invalid rank-check task status",
    );
  }
  const parsed = rankCheckPayloadSchema.safeParse(task.result?.[0]);
  if (!parsed.success) {
    throw new AppError(
      "INTERNAL_ERROR",
      "DataForSEO returned an incomplete rank-check SERP",
    );
  }
  const organic = parsed.data.items.filter((item) => item.type === "organic");
  if (organic.length === 0) {
    throw new AppError(
      "INTERNAL_ERROR",
      "DataForSEO returned no usable organic rankings",
    );
  }
  for (const item of organic) {
    const position = item.rank_group ?? item.rank_absolute;
    if (
      !Number.isInteger(position) ||
      position == null ||
      position <= 0 ||
      !item.domain ||
      !item.url
    ) {
      throw new AppError(
        "INTERNAL_ERROR",
        "DataForSEO returned an incomplete organic ranking",
      );
    }
    assertReliableRankUrl(item.url, item.domain);
  }
  return parsed.data.items;
}

export interface RankCheckResult {
  keywordId: string;
  keyword: string;
  position: number | null;
  url: string | null;
  serpFeatures: string[];
}

function buildRankCheckResult(
  input: { keywordId: string; keyword: string; targetDomain: string },
  items: SerpLiveItem[],
): RankCheckResult {
  const target = input.targetDomain.toLowerCase();
  const organicMatch = items.find((item) => {
    if (item.type !== "organic" || item.domain == null) return false;
    const domain = item.domain.toLowerCase();
    return domain === target || domain.endsWith(`.${target}`);
  });

  return {
    keywordId: input.keywordId,
    keyword: input.keyword,
    // rank_group = position among organic results only (what users count as
    // "my ranking"). rank_absolute would also count SERP features (local
    // pack, PAA, AI overviews) and reads as worse than what users see.
    position: organicMatch
      ? (organicMatch.rank_group ?? organicMatch.rank_absolute ?? null)
      : null,
    url: organicMatch?.url ?? null,
    serpFeatures: [...new Set(items.map((item) => item.type).filter(Boolean))],
  };
}

export async function fetchRankCheckSerp(input: {
  keyword: string;
  keywordId: string;
  locationCode: number;
  languageCode: string;
  locationName?: string;
  device: "desktop" | "mobile";
  targetDomain: string;
  depth: number;
}): Promise<DataforseoApiResponse<RankCheckResult>> {
  const depth = clampSerpDepth(input.depth);
  const locationParams = input.locationName
    ? { location_name: input.locationName }
    : { location_code: input.locationCode };
  const params = {
    keyword: input.keyword,
    ...locationParams,
    language_code: input.languageCode,
    device: input.device,
    os: input.device === "desktop" ? "windows" : "android",
    depth,
    ...stopCrawlOnTarget(input.targetDomain),
    resolve_goto_urls: true,
  };
  const request = new SerpGoogleOrganicLiveAdvancedRequestInfo(params);
  // SDK 2.0.19 drops this newer flag in toJSON. Serialize our exact request
  // parameters, including the native resolver, without adding a second call.
  request.toJSON = () => params;
  // Redirect resolution can take 260 seconds; leave room for the response.
  const response = await serpTaskApi(280_000).googleOrganicLiveAdvanced([
    request,
  ]);

  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  const billing = buildTaskBilling(task);
  try {
    return { data: buildRankCheckResult(input, rankCheckItems(task)), billing };
  } catch (error) {
    // The provider already charged for this read. The shared client meters
    // charged-task errors before rethrowing; a plain parsing error would lose
    // the cost and the workflow would incorrectly treat the read as free.
    throw new DataforseoChargedTaskError(
      error instanceof Error
        ? error.message
        : "DataForSEO returned an unreliable rank-check SERP",
      billing,
    );
  }
}

// ---------------------------------------------------------------------------
// Task-queue rank checks (scheduled runs). DataForSEO's standard queue costs
// ~30% of the live endpoint; tasks complete in ~5 minutes on average. The flow
// is task_post (charged) -> poll task_get (free), orchestrated by the
// rank check workflow. Unfinished tasks remain unchecked.
// ---------------------------------------------------------------------------

export interface RankCheckTaskInput {
  keyword: string;
  keywordId: string;
  device: "desktop" | "mobile";
}

export interface PostedRankCheckTask extends RankCheckTaskInput {
  taskId: string;
}

export async function postRankCheckTasks(input: {
  tasks: RankCheckTaskInput[];
  locationCode: number;
  languageCode: string;
  locationName?: string;
  depth: number;
  targetDomain: string;
}): Promise<DataforseoApiResponse<PostedRankCheckTask[]>> {
  if (input.tasks.length === 0 || input.tasks.length > MAX_TASKS_PER_POST) {
    throw new AppError(
      "INTERNAL_ERROR",
      `task_post accepts 1-${MAX_TASKS_PER_POST} tasks, got ${input.tasks.length}`,
    );
  }
  const depth = clampSerpDepth(input.depth);
  const locationParams = input.locationName
    ? { location_name: input.locationName }
    : { location_code: input.locationCode };
  const response = await serpTaskApi().googleOrganicTaskPost(
    input.tasks.map(
      (task) =>
        new SerpGoogleOrganicTaskPostRequestInfo({
          keyword: task.keyword,
          ...locationParams,
          language_code: input.languageCode,
          device: task.device,
          os: task.device === "desktop" ? "windows" : "android",
          depth,
          // Queued tasks are billed provisionally at full depth at post time;
          // task_get later reports the reduced actual cost when the crawl
          // stopped early. We meter customers on the post-time amount —
          // collection-time metering is a possible future optimization.
          ...stopCrawlOnTarget(input.targetDomain),
          // Echoed back on the response entry and task_get; used to map a
          // DataForSEO task id back to our keyword without relying on order.
          tag: `${task.keywordId}:${task.device}`,
        }),
    ),
  );

  if (!response || response.status_code !== 20000) {
    throw new AppError(
      "INTERNAL_ERROR",
      response?.status_message || "DataForSEO task_post failed",
    );
  }

  // One response entry per submitted task; accepted entries have status 20100
  // "Task Created" and their own cost (charged at post time). Cost is summed
  // over every entry — accepted or not — so anything DataForSEO charged is
  // metered. Rejected entries get no posted task and remain unchecked; the
  // workflow never launches an additional paid fallback.
  const byTag = new Map(
    input.tasks.map((task) => [`${task.keywordId}:${task.device}`, task]),
  );
  const posted: PostedRankCheckTask[] = [];
  let costUsd = 0;
  for (const entry of response.tasks ?? []) {
    costUsd += entry.cost ?? 0;
    const tag: unknown = entry.data?.tag;
    const task = typeof tag === "string" ? byTag.get(tag) : undefined;
    if (entry.status_code !== 20100 || !entry.id || !task) {
      console.warn(
        `dataforseo.task_post.rejected-entry (${entry.status_code}): ${entry.status_message}`,
      );
      continue;
    }
    posted.push({ ...task, taskId: entry.id });
  }

  return {
    data: posted,
    billing: {
      path: ["v3", "serp", "google", "organic", "task_post"],
      costUsd,
    },
  };
}

type RankCheckTaskOutcome =
  | { status: "pending" }
  | { status: "failed"; message: string }
  | { status: "completed"; result: RankCheckResult };

/**
 * Collect one queued task's result. Deliberately not metered and not wrapped
 * in the billing envelope: collection is free (the task was charged at
 * task_post), and the task_get response carries the task's settled cost
 * (reduced when stop_crawl_on_match ended the crawl early) — running it
 * through the metering seam would charge the customer twice.
 */
export async function fetchRankCheckTaskResult(input: {
  taskId: string;
  keywordId: string;
  keyword: string;
  targetDomain: string;
}): Promise<RankCheckTaskOutcome> {
  const response = await serpApi().googleOrganicTaskGetAdvanced(input.taskId);
  const task = response?.tasks?.[0];
  if (!response || response.status_code !== 20000 || !task) {
    throw new AppError(
      "INTERNAL_ERROR",
      response?.status_message || "DataForSEO task_get failed",
    );
  }

  if (isTaskInProgress(task)) {
    return { status: "pending" };
  }

  if (
    task.status_code !== 20000 &&
    !(
      (task.status_code === 40102 || task.status_code === 40501) &&
      isNoResultsTask(task)
    )
  ) {
    return {
      status: "failed",
      message:
        task.status_message || `DataForSEO task failed (${task.status_code})`,
    };
  }
  try {
    return {
      status: "completed",
      result: buildRankCheckResult(input, rankCheckItems(task)),
    };
  } catch (error) {
    return {
      status: "failed",
      message:
        error instanceof Error
          ? error.message
          : "DataForSEO returned an unreliable rank-check SERP",
    };
  }
}

export async function fetchLocalSerp(input: {
  keyword: string;
  locationCoordinate?: string;
  languageCode: string;
  searchType: "maps" | "local_finder";
  device: "desktop" | "mobile";
  depth: number;
  searchPlaces?: boolean;
}): Promise<DataforseoApiResponse<Record<string, unknown>[]>> {
  const os = input.device === "desktop" ? "windows" : "android";

  // Maps and Local Finder return different SDK item models; both carry an index
  // signature, so the typed items assign cleanly to the generic row shape.
  if (input.searchType === "maps") {
    const response = await serpApi().googleMapsLiveAdvanced([
      new SerpGoogleMapsLiveAdvancedRequestInfo({
        keyword: input.keyword,
        location_coordinate: input.locationCoordinate,
        language_code: input.languageCode,
        device: input.device,
        os,
        depth: input.depth,
        search_places: input.searchPlaces,
      }),
    ]);
    // 40501 = billed empty SERP; DataForSEO returns it for some coordinate-only
    // Maps and Local Finder queries (both paths below opt in).
    const task = assertOk(response, { treatNoResultsAsEmpty: true });
    return {
      data: task.result?.[0]?.items ?? [],
      billing: buildTaskBilling(task),
    };
  }

  const response = await serpApi().googleLocalFinderLiveAdvanced([
    new SerpGoogleLocalFinderLiveAdvancedRequestInfo({
      keyword: input.keyword,
      location_coordinate: input.locationCoordinate,
      language_code: input.languageCode,
      device: input.device,
      os,
      depth: input.depth,
    }),
  ]);
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  return {
    data: task.result?.[0]?.items ?? [],
    billing: buildTaskBilling(task),
  };
}

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkflowStep } from "cloudflare:workers";
import type { RankCheckTaskInput } from "@/server/lib/dataforseo";
import { runLiveCheck, runQueuedCheck } from "./rankCheckPaths";

const mocks = vi.hoisted(() => ({
  rankCheck: vi.fn(),
  rankCheckTaskPost: vi.fn(),
  fetchRankCheckTaskResult:
    vi.fn<(input: { taskId: string; keywordId: string }) => Promise<unknown>>(),
  insertSnapshots: vi.fn(),
  getSnapshotsForRun: vi.fn(),
  updateRun: vi.fn(),
  pgStep: vi.fn(),
}));
vi.mock("@/server/lib/dataforseo", () => ({
  MAX_TASKS_PER_POST: 100,
  fetchRankCheckTaskResult: mocks.fetchRankCheckTaskResult,
}));
vi.mock(
  "@/server/features/rank-tracking/repositories/RankTrackingRepository",
  () => ({
    RankTrackingRepository: mocks,
  }),
);
vi.mock("@/server/workflows/pgStep", () => ({ pgStep: mocks.pgStep }));

const sleep = vi.fn();
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- only sleep is used; pgStep is mocked independently
const step = { sleep } as unknown as WorkflowStep;
function context(count = 1) {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- this path only uses the two mocked SERP methods
  const client = {
    serp: {
      rankCheck: mocks.rankCheck,
      rankCheckTaskPost: mocks.rankCheckTaskPost,
    },
  } as unknown as Parameters<typeof runQueuedCheck>[1]["client"];
  return {
    client,
    keywords: Array.from({ length: count }, (_, i) => ({
      id: `kw_${i}`,
      keyword: `keyword ${i}`,
    })),
    devices: "desktop" as const,
    serpDepth: 10,
    domain: "example.com",
    locationCode: 2840,
    languageCode: "en",
    runId: "run_1",
  };
}
function result(keywordId = "kw_0") {
  return {
    keywordId,
    keyword: keywordId,
    position: null,
    url: null,
    serpFeatures: [],
  };
}

describe("rank check paid attempts and free collection", () => {
  beforeEach(() => {
    mocks.pgStep.mockImplementation(
      (_step: unknown, _name: string, _config: unknown, fn: () => unknown) =>
        fn(),
    );
    mocks.rankCheckTaskPost.mockImplementation(
      async ({ tasks }: { tasks: RankCheckTaskInput[] }) =>
        tasks.map((task) => ({ ...task, taskId: task.keywordId })),
    );
    mocks.fetchRankCheckTaskResult.mockResolvedValue({ status: "pending" });
    mocks.getSnapshotsForRun.mockResolvedValue([]);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("never makes a live call for pending, rejected or failed queued tasks", async () => {
    mocks.rankCheckTaskPost.mockResolvedValue([
      {
        keywordId: "kw_0",
        keyword: "keyword 0",
        device: "desktop",
        taskId: "task_0",
      },
    ]);
    mocks.fetchRankCheckTaskResult.mockResolvedValue({
      status: "failed",
      message: "provider failed",
    });
    const stats = await runQueuedCheck(step, context(2));
    expect(stats).toEqual({
      queueTasks: 1,
      queueCollected: 0,
      fallbackTasks: 0,
      fallbackChecked: 0,
    });
    expect(mocks.rankCheck).not.toHaveBeenCalled();
    expect(mocks.rankCheckTaskPost).toHaveBeenCalledTimes(1);
  });

  it("collects accepted paid tasks even after another post throws a billing error", async () => {
    mocks.rankCheckTaskPost.mockImplementationOnce(
      async ({ tasks }: { tasks: RankCheckTaskInput[] }) =>
        tasks.map((task) => ({ ...task, taskId: task.keywordId })),
    );
    mocks.rankCheckTaskPost.mockRejectedValueOnce(
      new Error("metering failed after provider charge"),
    );
    mocks.fetchRankCheckTaskResult.mockImplementation(
      async ({ keywordId }: { keywordId: string }) => ({
        status: "completed",
        result: result(keywordId),
      }),
    );
    const stats = await runQueuedCheck(step, context(101));
    expect(stats.queueCollected).toBe(100);
    expect(mocks.rankCheckTaskPost).toHaveBeenCalledTimes(2);
    expect(mocks.rankCheck).not.toHaveBeenCalled();
    for (const call of mocks.pgStep.mock.calls.filter((stepCall) =>
      String(stepCall[1]).startsWith("post-tasks"),
    )) {
      expect(call[2]).toMatchObject({ retries: { limit: 0 } });
    }
  });

  it("polls beyond the first 500 pending tasks in every round without paid fallback", async () => {
    const stats = await runQueuedCheck(step, context(501));
    expect(mocks.fetchRankCheckTaskResult).toHaveBeenCalledTimes(501 * 6);
    expect(
      mocks.fetchRankCheckTaskResult.mock.calls.filter(
        ([task]) => task.taskId === "kw_500",
      ),
    ).toHaveLength(6);
    expect(sleep).toHaveBeenCalledTimes(6);
    expect(stats.queueCollected).toBe(0);
    expect(mocks.rankCheck).not.toHaveBeenCalled();
  });

  it("continues collecting later chunks after a collect step exhausts free retries", async () => {
    mocks.pgStep.mockImplementation(
      (_step: unknown, name: string, _config: unknown, fn: () => unknown) => {
        if (name === "collect-0-0") throw new Error("database unavailable");
        return fn();
      },
    );
    mocks.fetchRankCheckTaskResult.mockImplementation(
      async ({ keywordId }: { keywordId: string }) => ({
        status: "completed",
        result: result(keywordId),
      }),
    );
    const stats = await runQueuedCheck(step, context(501));
    expect(stats.queueCollected).toBe(501);
    expect(mocks.fetchRankCheckTaskResult.mock.calls[0]?.[0].taskId).toBe(
      "kw_500",
    );
    expect(mocks.rankCheckTaskPost).toHaveBeenCalledTimes(6);
    expect(mocks.rankCheck).not.toHaveBeenCalled();
  });

  it("counts live progress only when all requested devices have reliable snapshots", async () => {
    mocks.rankCheck
      .mockResolvedValueOnce(result())
      .mockRejectedValueOnce(new Error("provider unavailable"));
    mocks.getSnapshotsForRun.mockResolvedValue([
      { trackingKeywordId: "kw_0", device: "desktop" },
    ]);
    await runLiveCheck(step, { ...context(), devices: "both" });
    expect(mocks.insertSnapshots).toHaveBeenCalledWith([
      expect.objectContaining({
        trackingKeywordId: "kw_0",
        device: "desktop",
        position: null,
      }),
    ]);
    expect(mocks.updateRun).toHaveBeenCalledWith("run_1", {
      keywordsChecked: 0,
    });
    expect(mocks.pgStep.mock.calls[0]?.[2]).toMatchObject({
      retries: { limit: 0 },
    });
  });
});

it("gives resolved live reads room to finish while retaining zero paid retries and the queue-post budget", async () => {
  mocks.pgStep.mockImplementation(
    (_step: unknown, _name: string, _config: unknown, fn: () => unknown) =>
      fn(),
  );
  mocks.rankCheck.mockResolvedValue(result());
  mocks.getSnapshotsForRun.mockResolvedValue([
    { trackingKeywordId: "kw_0", device: "desktop" },
  ]);
  await runLiveCheck(step, context());
  expect(
    mocks.pgStep.mock.calls.find((call) => call[1] === "live-batch-0")?.[2],
  ).toMatchObject({ timeout: "6 minutes", retries: { limit: 0 } });
  expect(mocks.insertSnapshots).toHaveBeenCalledWith([
    expect.objectContaining({ trackingKeywordId: "kw_0", device: "desktop" }),
  ]);
  mocks.rankCheckTaskPost.mockResolvedValue([]);
  await runQueuedCheck(step, context());
  expect(
    mocks.pgStep.mock.calls.find((call) => call[1] === "post-tasks-0")?.[2],
  ).toMatchObject({ timeout: "2 minutes", retries: { limit: 0 } });
});

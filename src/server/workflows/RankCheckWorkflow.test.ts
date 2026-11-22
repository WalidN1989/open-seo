import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkflowStep } from "cloudflare:workers";
import {
  prepareRankCheckKeywords,
  finalizeRankCheckRun,
  RankCheckWorkflow,
} from "./RankCheckWorkflow";

const mocks = vi.hoisted(() => ({
  getConfigById: vi.fn(),
  getRunById: vi.fn(),
  getKeywordsForConfig: vi.fn(),
  updateRun:
    vi.fn<
      (
        runId: string,
        patch: { errorMessage?: string } & Record<string, unknown>,
      ) => Promise<boolean>
    >(),
  getTargetsForRun: vi.fn(),
  prepareRunTargets: vi.fn(),
  getSnapshotsForRun: vi.fn(),
  updateConfig: vi.fn(),
  autumnCheck: vi.fn(),
  createDataforseoClient: vi.fn(),
  runLiveCheck: vi.fn(),
  failRunIfActive: vi.fn(),
  captureServerEvent: vi.fn(),
  isHostedServerAuthMode: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({
  WorkflowEntrypoint: vi.fn(),
}));
vi.mock("cloudflare:workflows", () => ({
  NonRetryableError: class extends Error {},
}));
vi.mock("@/db", () => ({ withPgClient: (fn: () => unknown) => fn() }));
vi.mock(
  "@/server/features/rank-tracking/repositories/RankTrackingRepository",
  () => ({ RankTrackingRepository: mocks }),
);
vi.mock("@/server/features/rank-tracking/services/rankCheckRunGuards", () => ({
  failRunIfActive: mocks.failRunIfActive,
}));
vi.mock("@/server/workflows/rankCheckPaths", () => ({
  runLiveCheck: mocks.runLiveCheck,
  runQueuedCheck: vi.fn(),
}));
vi.mock("@/server/workflows/pgStep", () => ({
  pgStep: (
    _step: unknown,
    _name: string,
    _config: unknown,
    fn: () => unknown,
  ) => fn(),
}));
vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: mocks.createDataforseoClient,
}));
vi.mock("@/server/lib/posthog", () => ({
  captureServerEvent: mocks.captureServerEvent,
}));
vi.mock("@/server/billing/autumn", () => ({
  autumn: { check: mocks.autumnCheck },
}));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: mocks.isHostedServerAuthMode,
}));

const billingCustomer = {
  userId: "user_1",
  userEmail: "user@example.com",
  organizationId: "org_1",
  projectId: "project_1",
};

const activeRun = {
  id: "run_1",
  status: "running",
};

describe("rank check workflow credit ceiling", () => {
  beforeEach(() => {
    mocks.getRunById.mockResolvedValue(activeRun);
    mocks.getTargetsForRun.mockResolvedValue([]);
    mocks.prepareRunTargets.mockImplementation(
      async (
        runId: string,
        keywords: Array<{ id: string; keyword: string }>,
        devices: "both" | "desktop" | "mobile",
      ) =>
        keywords.flatMap((kw: { id: string; keyword: string }) =>
          (devices === "both" ? ["desktop", "mobile"] : [devices]).map(
            (device) => ({
              runId,
              trackingKeywordId: kw.id,
              keyword: kw.keyword,
              device,
            }),
          ),
        ),
    );
    mocks.updateRun.mockResolvedValue(true);
    mocks.isHostedServerAuthMode.mockResolvedValue(true);
    mocks.autumnCheck.mockResolvedValue({ balance: { remaining: 1_000 } });
  });

  it("rejects a keyword-list race before balance or DataForSEO calls", async () => {
    mocks.getConfigById.mockResolvedValue({ isActive: true });
    mocks.getKeywordsForConfig.mockResolvedValue(
      Array.from({ length: 5 }, (_, index) => ({
        id: `kw_${index}`,
        keyword: `keyword ${index}`,
      })),
    );
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the mocked base class does not inspect Worker constructor context
    const workflow = new RankCheckWorkflow({} as ExecutionContext, {} as Env);

    await expect(
      workflow.run(
        {
          instanceId: "run_1",
          timestamp: new Date(),
          payload: {
            runId: "run_1",
            configId: "config_1",
            billingCustomer,
            projectId: "project_1",
            domain: "example.com",
            locationCode: 2840,
            languageCode: "en",
            devices: "desktop",
            serpDepth: 10,
            trigger: "manual",
            maxCostCredits: 12,
          },
        },
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- workflow steps are executed directly by the pgStep mock
        {} as WorkflowStep,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(mocks.autumnCheck).not.toHaveBeenCalled();
    expect(mocks.createDataforseoClient).not.toHaveBeenCalled();
    expect(mocks.runLiveCheck).not.toHaveBeenCalled();
  });

  it("prices the frozen plan rather than an earlier keyword list before paying", async () => {
    mocks.getKeywordsForConfig.mockResolvedValue([
      { id: "kw_1", keyword: "ordinary" },
    ]);
    mocks.prepareRunTargets.mockResolvedValue([
      {
        trackingKeywordId: "kw_1",
        keyword: "site:example.com",
        device: "desktop",
      },
    ]);
    await expect(
      prepareRankCheckKeywords({
        runId: "run_1",
        configId: "config_1",
        billingCustomer,
        devices: "desktop",
        serpDepth: 10,
        trigger: "manual",
        maxCostCredits: 3,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.autumnCheck).not.toHaveBeenCalled();
    expect(mocks.createDataforseoClient).not.toHaveBeenCalled();
  });

  it("accepts the exact operator approval with all configured devices", async () => {
    mocks.getKeywordsForConfig.mockResolvedValue([
      { id: "kw_1", keyword: "site:example.com" },
    ]);
    await expect(
      prepareRankCheckKeywords({
        runId: "run_1",
        configId: "config_1",
        billingCustomer,
        devices: "both",
        serpDepth: 10,
        trigger: "manual",
        maxCostCredits: 26,
      }),
    ).resolves.toEqual({
      keywords: [{ id: "kw_1", keyword: "site:example.com" }],
    });
  });

  it("accepts the same reloaded list at the approved ceiling", async () => {
    mocks.getKeywordsForConfig.mockResolvedValue(
      Array.from({ length: 4 }, (_, index) => ({
        id: `kw_${index}`,
        keyword: `keyword ${index}`,
      })),
    );

    const result = await prepareRankCheckKeywords({
      runId: "run_1",
      configId: "config_1",
      billingCustomer,
      devices: "desktop",
      serpDepth: 10,
      trigger: "manual",
      maxCostCredits: 12,
    });

    expect(result.keywords).toHaveLength(4);
    expect(mocks.autumnCheck).toHaveBeenCalledTimes(2);
  });

  it("preserves callers that do not provide a ceiling", async () => {
    mocks.getKeywordsForConfig.mockResolvedValue(
      Array.from({ length: 5 }, (_, index) => ({
        id: `kw_${index}`,
        keyword: `keyword ${index}`,
      })),
    );
    mocks.isHostedServerAuthMode.mockResolvedValue(false);

    const result = await prepareRankCheckKeywords({
      runId: "run_1",
      configId: "config_1",
      billingCustomer,
      devices: "desktop",
      serpDepth: 10,
      trigger: "manual",
    });

    expect(result.keywords).toHaveLength(5);
    expect(mocks.autumnCheck).not.toHaveBeenCalled();
  });
});

describe("rank run coverage", () => {
  const input = {
    runId: "run_1",
    configId: "config_1",
    projectId: "project_1",
    billingCustomer,
    trigger: "manual" as const,
    batchError: null,
    queueStats: null,
  };
  beforeEach(() => {
    mocks.updateRun.mockResolvedValue(true);
    mocks.getRunById.mockResolvedValue({
      ...activeRun,
      targetsPrepared: true,
      keywordsTotal: 1,
    });
    const targets = [
      { trackingKeywordId: "kw_1", keyword: "query", device: "desktop" },
      { trackingKeywordId: "kw_1", keyword: "query", device: "mobile" },
    ];
    mocks.getTargetsForRun.mockResolvedValue(targets);
    mocks.prepareRunTargets.mockResolvedValue(targets);
  });
  it("reports a missing device even when the keyword has a desktop snapshot", async () => {
    mocks.getSnapshotsForRun.mockResolvedValue([
      { trackingKeywordId: "kw_1", device: "desktop", position: 2 },
    ]);
    await finalizeRankCheckRun(input);
    expect(mocks.updateRun).toHaveBeenCalledWith(
      "run_1",
      expect.objectContaining({
        status: "completed",
        keywordsChecked: 0,
      }),
    );
    expect(mocks.updateRun.mock.calls.at(-1)?.[1].errorMessage).toContain(
      "1 keyword/device",
    );
  });
  it("fails zero-observation runs without advancing last successful check", async () => {
    mocks.getSnapshotsForRun.mockResolvedValue([]);
    await finalizeRankCheckRun(input);
    expect(mocks.updateRun).toHaveBeenCalledWith(
      "run_1",
      expect.objectContaining({ status: "failed" }),
    );
    expect(mocks.updateConfig).not.toHaveBeenCalled();
  });
  it("does not publish success if cleanup wins the terminal transition", async () => {
    mocks.getSnapshotsForRun.mockResolvedValue([
      { trackingKeywordId: "kw_1", device: "desktop", position: 2 },
    ]);
    mocks.updateRun.mockResolvedValue(false);
    await finalizeRankCheckRun(input);
    expect(mocks.updateConfig).not.toHaveBeenCalled();
    expect(mocks.captureServerEvent).not.toHaveBeenCalled();
  });
  it("does not reload edited keyword text after targets are frozen", async () => {
    mocks.isHostedServerAuthMode.mockResolvedValue(false);
    const result = await prepareRankCheckKeywords({
      ...input,
      devices: "both",
      serpDepth: 10,
    });
    expect(result.keywords).toEqual([{ id: "kw_1", keyword: "query" }]);
    expect(mocks.getKeywordsForConfig).not.toHaveBeenCalled();
    expect(mocks.prepareRunTargets).toHaveBeenCalledWith(
      "run_1",
      [{ id: "kw_1", keyword: "query" }],
      "both",
    );
  });
});

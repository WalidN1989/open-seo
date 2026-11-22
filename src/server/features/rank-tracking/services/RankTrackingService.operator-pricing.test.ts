import { beforeEach, describe, expect, it, vi } from "vitest";
import { RankTrackingService } from "./RankTrackingService";

const mocks = vi.hoisted(() => ({
  getConfigById: vi.fn(),
  getKeywordsForConfig: vi.fn(),
  addKeywordsToConfig: vi.fn(),
  removeKeywordsFromConfig: vi.fn(),
  isHostedServerAuthMode: vi.fn(),
  customerHasPaidPlan: vi.fn(),
  beginRankCheckRun: vi.fn(),
  createDataforseoClient: vi.fn(),
  fetchKeywordMetricsForList: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: { RANK_CHECK_WORKFLOW: {} } }));
vi.mock(
  "@/server/features/rank-tracking/repositories/RankTrackingRepository",
  () => ({ RankTrackingRepository: mocks }),
);
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: mocks.isHostedServerAuthMode,
}));
vi.mock("@/server/billing/subscription", () => ({
  customerHasPaidPlan: mocks.customerHasPaidPlan,
}));
vi.mock("@/server/features/rank-tracking/services/rankCheckRunGuards", () => ({
  beginRankCheckRun: mocks.beginRankCheckRun,
  reconcileActiveRankCheckRun: vi.fn(),
}));
vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: mocks.createDataforseoClient,
  fetchKeywordMetricsForList: mocks.fetchKeywordMetricsForList,
}));

const config = {
  id: "config_1",
  projectId: "project_1",
  domain: "example.com",
  locationCode: 2840,
  languageCode: "en",
  locationName: null,
  devices: "both" as const,
  serpDepth: 10,
  scheduleInterval: "weekly" as const,
};

const billingCustomer = {
  userId: "user_1",
  userEmail: "user@example.com",
  organizationId: "org_1",
  projectId: "project_1",
};

describe("rank tracker operator pricing", () => {
  beforeEach(() => {
    mocks.getConfigById.mockResolvedValue(config);
    mocks.isHostedServerAuthMode.mockResolvedValue(false);
  });
  it("prices existing operator keywords in both live and recurring estimates", async () => {
    mocks.getKeywordsForConfig.mockResolvedValue([
      { id: "kw_1", keyword: "site:example.com" },
    ]);
    await expect(
      RankTrackingService.estimateCost("config_1", "project_1"),
    ).resolves.toMatchObject({
      costCredits: 26,
      scheduledEstimate: { costCredits: 8 },
    });
  });

  it("requires the operator surcharge before adding scheduled keywords", async () => {
    mocks.getKeywordsForConfig.mockResolvedValue([]);
    await expect(
      RankTrackingService.addKeywords(
        "config_1",
        "project_1",
        ["site:example.com"],
        {
          kind: "credit_ceiling",
          maxEstimatedScheduledCheckCredits: 2,
        },
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.addKeywordsToConfig).not.toHaveBeenCalled();
  });

  it("rolls back its additions when a concurrent operator increases scheduled cost", async () => {
    mocks.getKeywordsForConfig.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { id: "own", keyword: "seo" },
      { id: "concurrent", keyword: "site:example.com" },
    ]);
    mocks.addKeywordsToConfig.mockImplementation(
      async (rows: Array<{ id: string }>) => rows.map((row) => row.id),
    );
    await expect(
      RankTrackingService.addKeywords("config_1", "project_1", ["seo"], {
        kind: "credit_ceiling",
        maxEstimatedScheduledCheckCredits: 2,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.removeKeywordsFromConfig).toHaveBeenCalled();
  });

  it("rejects operator checks above the exact approved live ceiling", async () => {
    mocks.getKeywordsForConfig.mockResolvedValue([
      { id: "kw_1", keyword: "site:example.com" },
    ]);
    await expect(
      RankTrackingService.triggerCheck({
        configId: "config_1",
        projectId: "project_1",
        billingCustomer,
        maxCostCredits: 6,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.beginRankCheckRun).not.toHaveBeenCalled();
  });
});

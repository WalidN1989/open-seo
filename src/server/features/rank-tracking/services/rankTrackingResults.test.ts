import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLatestResults } from "./rankTrackingResults";

vi.mock("cloudflare:workers", () => ({ env: {} }));

const mocks = vi.hoisted(() => ({
  getConfigById: vi.fn(),
  getTargetsForRun: vi.fn(),
  getKeywordsForConfig: vi.fn(),
  getLatestSnapshotsForKeywords: vi.fn(),
  getSnapshotsBeforeDate: vi.fn(),
  getLatestRunForConfig: vi.fn(),
  getEarliestSnapshotsForKeywords: vi.fn(),
}));

vi.mock(
  "@/server/features/rank-tracking/repositories/RankTrackingRepository",
  () => ({ RankTrackingRepository: mocks }),
);

describe("getLatestResults", () => {
  beforeEach(() => {
    mocks.getTargetsForRun.mockResolvedValue([]);
    mocks.getConfigById.mockResolvedValue({ id: "config_1" });
    mocks.getKeywordsForConfig.mockResolvedValue([]);
    mocks.getLatestSnapshotsForKeywords.mockResolvedValue([]);
    mocks.getSnapshotsBeforeDate.mockResolvedValue([]);
    mocks.getEarliestSnapshotsForKeywords.mockResolvedValue([]);
  });

  it("keeps snapshot freshness when a newer run fails before writing snapshots", async () => {
    mocks.getKeywordsForConfig.mockResolvedValue([
      {
        id: "kw_1",
        keyword: "open seo",
        searchVolume: 100,
        keywordDifficulty: 10,
        cpc: 1,
      },
    ]);
    mocks.getLatestSnapshotsForKeywords.mockResolvedValue([
      {
        trackingKeywordId: "kw_1",
        device: "desktop",
        runId: "run_1",
        checkedAt: "2026-08-01 10:00:00",
        position: 3,
        url: "https://example.com/",
        serpFeatures: null,
      },
    ]);
    mocks.getLatestRunForConfig.mockResolvedValue({
      id: "run_2",
      status: "failed",
      errorMessage: "Provider request timed out",
    });

    await expect(
      getLatestResults("config_1", "project_1"),
    ).resolves.toMatchObject({
      run: {
        id: "run_2",
        lastCheckedAt: "2026-08-01 10:00:00",
        status: "failed",
        errorMessage: "Provider request timed out",
      },
    });
  });

  it("surfaces the latest failed run and its error message", async () => {
    mocks.getLatestRunForConfig.mockResolvedValue({
      id: "run_1",
      status: "failed",
      errorMessage: "Provider request timed out",
    });

    await expect(
      getLatestResults("config_1", "project_1"),
    ).resolves.toMatchObject({
      run: {
        id: "run_1",
        lastCheckedAt: null,
        status: "failed",
        errorMessage: "Provider request timed out",
      },
    });
  });
});

it("retains a prior rank as not checked while a genuine not-found stays checked", async () => {
  mocks.getConfigById.mockResolvedValue({ id: "config_1" });
  mocks.getKeywordsForConfig.mockResolvedValue([
    { id: "kw_1", keyword: "query" },
  ]);
  mocks.getLatestRunForConfig.mockResolvedValue({
    id: "new",
    status: "completed",
    targetsPrepared: true,
  });
  mocks.getTargetsForRun.mockResolvedValue([
    { trackingKeywordId: "kw_1", device: "desktop" },
    { trackingKeywordId: "kw_1", device: "mobile" },
  ]);
  mocks.getSnapshotsBeforeDate.mockResolvedValue([]);
  mocks.getEarliestSnapshotsForKeywords.mockResolvedValue([]);
  mocks.getLatestSnapshotsForKeywords.mockResolvedValue([
    {
      runId: "old",
      trackingKeywordId: "kw_1",
      device: "desktop",
      position: 3,
      checkedAt: "2026-01-01",
      url: "https://example.com",
      serpFeatures: null,
    },
    {
      runId: "new",
      trackingKeywordId: "kw_1",
      device: "mobile",
      position: null,
      checkedAt: "2026-01-02",
      url: null,
      serpFeatures: null,
    },
  ]);
  const result = await getLatestResults("config_1", "project_1");
  expect(result.rows[0].desktop).toMatchObject({
    position: 3,
    checkedAt: "2026-01-01",
    checkState: "not_checked",
  });
  expect(result.rows[0].mobile).toMatchObject({
    position: null,
    checkState: "checked",
  });
});

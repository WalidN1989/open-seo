import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  upsert: vi.fn(),
  metrics: vi.fn(),
}));
vi.mock(
  "@/server/features/keywords/repositories/KeywordResearchRepository",
  () => ({
    KeywordResearchRepository: {
      listSavedKeywordsByProject: mocks.list,
      upsertKeywordMetric: mocks.upsert,
    },
  }),
);
vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: () => ({}),
  fetchKeywordMetricsForList: mocks.metrics,
}));
import { refreshSavedKeywordMetrics } from "./refresh-metrics";
const customer = {
  organizationId: "org",
  userId: "user",
  userEmail: "test@example.com",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockResolvedValue({
    rows: [
      {
        row: {
          id: "ours",
          keyword: "books",
          locationCode: 2840,
          languageCode: "en",
        },
      },
      {
        row: {
          id: "old",
          keyword: "existing",
          locationCode: 2840,
          languageCode: "en",
        },
      },
    ],
  });
  mocks.metrics.mockResolvedValue([
    { keyword: "books", searchVolume: 10, monthlySearches: [] },
  ]);
});
it("only buys stats for imported ids belonging to the authorized project", async () => {
  await refreshSavedKeywordMetrics(
    { projectId: "project", savedKeywordIds: ["ours", "foreign"] },
    customer,
  );
  expect(mocks.list).toHaveBeenCalledWith({ projectId: "project" });
  expect(mocks.metrics).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ keywords: ["books"] }),
  );
  expect(mocks.upsert).toHaveBeenCalledOnce();
});
it("does not spend when none of the selected ids belong to the project", async () => {
  expect(
    await refreshSavedKeywordMetrics(
      { projectId: "project", savedKeywordIds: ["foreign"] },
      customer,
    ),
  ).toEqual({ updated: 0 });
  expect(mocks.metrics).not.toHaveBeenCalled();
});

import { expect, it, vi } from "vitest";
import { getRankTrackerTool } from "./get-rank-tracker";
import { makeToolContext, textContent } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  getTracker: vi.fn(),
}));
vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: { getProjectForMember: mocks.getProjectForOrganization },
}));
vi.mock("@/server/features/rank-tracking/services/RankTrackingService", () => ({
  RankTrackingService: { getTracker: mocks.getTracker },
}));
const toolContext = makeToolContext();

it("get_rank_tracker reports partial completed runs and per-device observation freshness", async () => {
  mocks.getProjectForOrganization.mockResolvedValue({
    organizationId: "org_123",
    id: "project_1",
    locationCode: 2840,
    languageCode: "en",
  });
  mocks.getTracker.mockResolvedValue({
    config: {
      id: "tracker_1",
      domain: "example.com",
      scheduleInterval: "daily",
      devices: "both",
      serpDepth: 20,
    },
    results: {
      run: {
        id: "run_1",
        lastCheckedAt: "2026-11-20",
        status: "completed",
        errorMessage: "1 device could not be checked",
      },
      rows: [
        {
          keyword: "seo tools",
          desktop: {
            checkState: "checked",
            checkedAt: "2026-11-21",
            position: 3,
          },
          mobile: {
            checkState: "not_checked",
            checkedAt: "2026-11-20",
            position: 7,
          },
        },
      ],
    },
  });
  const result = await getRankTrackerTool.handler(
    { projectId: "project_1", trackerId: "tracker_1" },
    toolContext,
  );
  const text = textContent(result);
  expect(text).toContain(
    "Latest run incomplete: 1 device could not be checked",
  );
  expect(text).toContain("checked | 2026-11-21 | not_checked | 2026-11-20");
  expect(text).toContain("last known observations, not ranking losses");
});

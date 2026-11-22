import { beforeEach, expect, it, vi } from "vitest";
import type { z } from "zod";
import {
  addSearchPerformanceTracking,
  estimateSearchPerformanceTracking,
} from "./searchPerformanceTracking";
const mocks = vi.hoisted(() => ({
  addKeywords: vi.fn(),
  estimateCost: vi.fn(),
  triggerCheck: vi.fn(),
  refreshKeywordMetrics: vi.fn(),
}));
vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/rank-tracking/services/RankTrackingService", () => ({
  RankTrackingService: mocks,
}));
vi.mock("./middleware", () => ({ requireProjectContext: [] }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: () => ({
      validator: (schema: z.ZodType) => ({
        handler:
          (
            fn: (input: {
              data: unknown;
              context: { projectId: string };
            }) => unknown,
          ) =>
          ({ data }: { data: unknown }) =>
            fn({
              data: schema.parse(data),
              context: { projectId: "authorized-project" },
            }),
      }),
    }),
  }),
}));
const data = {
  projectId: "foreign-payload",
  configId: "11111111-1111-4111-8111-111111111111",
  keywords: ["books", "bookshop"],
};
beforeEach(() => {
  mocks.addKeywords.mockResolvedValue({ added: 2, addedIds: ["a", "b"] });
  mocks.estimateCost.mockResolvedValue({
    scheduledEstimate: { costCredits: 12 },
  });
});
it("estimates the added selection against the authorized project without provider work", async () => {
  await estimateSearchPerformanceTracking({ data });
  expect(mocks.estimateCost).toHaveBeenCalledWith(
    data.configId,
    "authorized-project",
    2,
  );
  expect(mocks.triggerCheck).not.toHaveBeenCalled();
  expect(mocks.refreshKeywordMetrics).not.toHaveBeenCalled();
});
it("saves only keywords and passes the explicit recurring ceiling to the service", async () => {
  await addSearchPerformanceTracking({
    data: { ...data, maxEstimatedScheduledCheckCredits: 12 },
  });
  expect(mocks.addKeywords).toHaveBeenCalledWith(
    data.configId,
    "authorized-project",
    data.keywords,
    { kind: "credit_ceiling", maxEstimatedScheduledCheckCredits: 12 },
  );
  expect(mocks.triggerCheck).not.toHaveBeenCalled();
  expect(mocks.refreshKeywordMetrics).not.toHaveBeenCalled();
});
it("rejects invalid credit ceilings before mutation", () => {
  expect(() =>
    addSearchPerformanceTracking({
      data: { ...data, maxEstimatedScheduledCheckCredits: -1 },
    }),
  ).toThrow();
  expect(mocks.addKeywords).not.toHaveBeenCalled();
});

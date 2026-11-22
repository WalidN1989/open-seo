import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  live: vi.fn(),
  record: vi.fn(),
  cached: vi.fn(),
  cacheKey: vi.fn(async (_prefix: string, params: unknown) =>
    JSON.stringify(params),
  ),
}));
vi.mock("cloudflare:workers", () => ({ waitUntil: vi.fn() }));
vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: () => ({ serp: { live: mocks.live } }),
}));
vi.mock("@/server/lib/r2-cache", () => ({
  buildCacheKey: mocks.cacheKey,
  getCached: mocks.cached,
  setCached: vi.fn(async () => undefined),
}));
vi.mock("@/server/features/competitors/recordSerp", () => ({
  recordSerpObservations: mocks.record,
}));
import { getSerpAnalysis } from "./serp";
const input = {
  projectId: "project",
  keyword: "Books",
  locationCode: 2840,
  languageCode: "en",
};
const customer = {
  organizationId: "org",
  userId: "user",
  userEmail: "test@example.com",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.cached.mockResolvedValue(null);
  mocks.live.mockResolvedValue([
    {
      type: "organic",
      rank_group: 2,
      title: "Example",
      url: "https://example.com/books",
      domain: "example.com",
    },
  ]);
});
it("starts at depth20 and buys a separate explicit depth100 snapshot without dropping competitor evidence", async () => {
  await getSerpAnalysis(input, customer);
  await getSerpAnalysis({ ...input, depth: 100 }, customer);
  expect(mocks.live).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({ depth: 20 }),
  );
  expect(mocks.live).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ depth: 100 }),
  );
  expect(mocks.cacheKey).toHaveBeenNthCalledWith(
    1,
    "serp:analysis:v2",
    expect.objectContaining({ depth: 20 }),
  );
  expect(mocks.cacheKey).toHaveBeenNthCalledWith(
    2,
    "serp:analysis:v2",
    expect.objectContaining({ depth: 100 }),
  );
  expect(mocks.record).toHaveBeenCalledTimes(2);
  expect(mocks.record.mock.calls[0][0]).toMatchObject({
    projectId: "project",
    keyword: "books",
    items: [expect.objectContaining({ rank: 2, domain: "example.com" })],
  });
});
it("still records custom project evidence when a snapshot comes from cache", async () => {
  mocks.cached.mockResolvedValue({
    requestedKeyword: "books",
    depth: 20,
    items: [
      {
        rank: 2,
        title: "Example",
        url: "https://example.com/books",
        domain: "example.com",
        description: "",
        etv: null,
        estimatedPaidTrafficCost: null,
        referringDomains: null,
        backlinks: null,
        isNew: false,
        rankChange: null,
      },
    ],
  });
  await getSerpAnalysis(input, customer);
  expect(mocks.live).not.toHaveBeenCalled();
  expect(mocks.record).toHaveBeenCalledOnce();
});

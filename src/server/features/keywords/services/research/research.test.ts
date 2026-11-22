import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  ads: vi.fn(),
  getCached: vi.fn(),
  persist: vi.fn(),
}));
vi.mock("@/server/lib/r2-cache", () => ({
  CACHE_TTL: { researchResult: 100 },
  buildCacheKey: async (prefix: string, args: unknown) =>
    prefix + JSON.stringify(args),
  getCached: mocks.getCached,
  setCached: vi.fn(),
}));
vi.mock("@/server/features/keywords/repositories/keywordMetricsWrite", () => ({
  upsertKeywordMetrics: mocks.persist,
}));
vi.mock("./research-data", () => ({
  fetchResearchRowsBySource: mocks.fetch,
  fetchGoogleAdsResearchRows: mocks.ads,
}));
import { research } from "./research";
const customer = {
  organizationId: "org",
  userId: "user",
  userEmail: "test@example.com",
};
const input = {
  projectId: "project",
  keywords: ["seo"],
  locationCode: 2840,
  languageCode: "en",
  resultLimit: 150 as const,
  mode: "auto" as const,
  clickstream: false,
};
const row = (keyword: string) => ({
  keyword,
  searchVolume: 20,
  trend: [],
  cpc: 1,
  competition: 0.5,
  keywordDifficulty: 10,
  intent: "unknown" as const,
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCached.mockResolvedValue(null);
  mocks.persist.mockResolvedValue(undefined);
});
describe("research upstream adaptation", () => {
  it("balances suggestions and ideas without losing project metric persistence", async () => {
    mocks.fetch.mockImplementation(async ({ source }: { source: string }) =>
      Array.from({ length: 5 }, (_, i) => row(`${source} ${i}`)),
    );
    const result = await research(input, customer);
    expect(result.source).toBe("blended");
    expect(result.rows.slice(0, 4).map((r) => r.keyword)).toEqual([
      "suggestions 0",
      "ideas 0",
      "suggestions 1",
      "ideas 1",
    ]);
    expect(mocks.fetch).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ source: "suggestions" }),
      customer,
    );
    expect(mocks.fetch).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ source: "ideas" }),
      customer,
    );
    expect(mocks.fetch.mock.calls[0][0]).toMatchObject({
      resultLimit: 75,
      ignoreSynonyms: true,
    });
    expect(mocks.persist).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ projectId: "project", keyword: "ideas 0" }),
      ]),
    );
  });
  it("filters wildcard patterns in the provider before the limit and rejects invalid seeds before spend", async () => {
    mocks.fetch.mockResolvedValue([row("best books for kids")]);
    await research(
      { ...input, keywords: ["best * for kids"], groupKeywords: true },
      customer,
    );
    expect(mocks.fetch.mock.calls[0][0]).toMatchObject({
      source: "suggestions",
      seedKeyword: "for kids",
      ignoreSynonyms: false,
    });
    expect(mocks.fetch.mock.calls[0][0]).toHaveProperty(
      "filters",
      expect.arrayContaining([["keyword", "like", "best % for kids"]]),
    );
    mocks.fetch.mockClear();
    await expect(
      research({ ...input, keywords: ["***"] }, customer),
    ).rejects.toThrow("at least one word");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("keeps cached answers in the custom researched-keyword library", async () => {
    mocks.getCached.mockResolvedValue({
      rows: [row("cached seo")],
      source: "blended",
      usedFallback: false,
      diagnostics: { requestedMode: "auto", threshold: 5, sourceAttempts: [] },
    });
    const result = await research(input, customer);
    expect(result.rows[0].keyword).toBe("cached seo");
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.persist).toHaveBeenCalledOnce();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: vi.fn(async () => "test-api-key"),
}));

import {
  fetchRankCheckSerp,
  fetchRankCheckTaskResult,
  postRankCheckTasks,
} from "@/server/lib/dataforseo/serp";

function parseDataforseoRequestBody(init: RequestInit | undefined): unknown {
  const body = init?.body;
  if (typeof body !== "string") {
    throw new Error("Expected DataForSEO request body to be a string");
  }
  return JSON.parse(body) as unknown;
}

describe("rank check task queue", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("posts queued tasks, maps ids by tag, and sums cost over all entries", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [
          {
            id: "task-a",
            status_code: 20100,
            cost: 0.0006,
            data: { tag: "kw-1:desktop" },
          },
          {
            id: "task-b",
            status_code: 20100,
            cost: 0.0006,
            data: { tag: "kw-1:mobile" },
          },
          {
            id: "task-c",
            status_code: 40006,
            status_message: "Task Limit Exceeded",
            cost: 0.0006,
            data: { tag: "kw-2:desktop" },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await postRankCheckTasks({
      tasks: [
        { keyword: "alpha", keywordId: "kw-1", device: "desktop" },
        { keyword: "alpha", keywordId: "kw-1", device: "mobile" },
        { keyword: "beta", keywordId: "kw-2", device: "desktop" },
      ],
      locationCode: 2840,
      languageCode: "en",
      depth: 20,
      targetDomain: "example.com",
    });

    expect(
      fetchMock.mock.calls.map(([url]) =>
        typeof url === "string" || url instanceof URL
          ? url.toString()
          : url.url,
      ),
    ).toEqual(["https://api.dataforseo.com/v3/serp/google/organic/task_post"]);

    // Every posted task asks DataForSEO to stop crawling at the target's
    // organic listing — that is what cuts the actual crawl cost for ranking
    // domains without false "not ranking" stops on sitelinks/PAA mentions.
    const stopCrawl = {
      stop_crawl_on_match: [
        { match_value: "example.com", match_type: "with_subdomains" },
      ],
      find_targets_in: ["organic"],
    };
    expect(
      parseDataforseoRequestBody(fetchMock.mock.calls[0]?.[1]),
    ).toMatchObject([stopCrawl, stopCrawl, stopCrawl]);
    expect(result.data).toEqual([
      {
        keyword: "alpha",
        keywordId: "kw-1",
        device: "desktop",
        taskId: "task-a",
      },
      {
        keyword: "alpha",
        keywordId: "kw-1",
        device: "mobile",
        taskId: "task-b",
      },
    ]);
    // The rejected entry's cost is still metered: a charge is a charge.
    expect(result.billing.costUsd).toBeCloseTo(0.0018, 10);
    expect(result.billing.path).toEqual([
      "v3",
      "serp",
      "google",
      "organic",
      "task_post",
    ]);
  });

  it("reports a queued task still in progress as pending", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [{ id: "task-a", status_code: 40602 }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await fetchRankCheckTaskResult({
      taskId: "task-a",
      keywordId: "kw-1",
      keyword: "alpha",
      targetDomain: "example.com",
    });

    expect(outcome).toEqual({ status: "pending" });
  });

  it("parses a completed queued task into a rank check result", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [
          {
            id: "task-a",
            status_code: 20000,
            cost: 0,
            path: ["v3", "serp", "google", "organic", "task_get", "advanced"],
            result: [
              {
                items: [
                  {
                    type: "organic",
                    rank_group: 3,
                    rank_absolute: 4,
                    domain: "www.example.com",
                    url: "https://www.example.com/page",
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await fetchRankCheckTaskResult({
      taskId: "task-a",
      keywordId: "kw-1",
      keyword: "alpha",
      targetDomain: "example.com",
    });

    expect(outcome).toEqual({
      status: "completed",
      result: {
        keywordId: "kw-1",
        keyword: "alpha",
        position: 3,
        url: "https://www.example.com/page",
        serpFeatures: ["organic"],
      },
    });
  });
});

const rankInput = {
  keywordId: "kw-1",
  keyword: "alpha",
  targetDomain: "example.com",
  device: "desktop" as const,
  locationCode: 2840,
  languageCode: "en",
  depth: 20,
};
const validOrganic = {
  type: "organic",
  rank_group: 3,
  domain: "www.example.com",
  url: "https://www.example.com/page",
};

function rankResponse(task: Record<string, unknown>) {
  return Response.json({
    status_code: 20000,
    tasks: [
      {
        status_code: 20000,
        cost: 0.002,
        path: ["v3", "serp", "google", "organic", "live", "advanced"],
        ...task,
      },
    ],
  });
}

describe("rank check SERP reliability", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["missing result", {}],
    ["null items", { result: [{ items: null }] }],
    ["empty success", { result: [{ items: [] }] }],
    ["no organic", { result: [{ items: [{ type: "people_also_ask" }] }] }],
    ["malformed item", { result: [{ items: [{ type: 7 }] }] }],
    [
      "missing domain",
      { result: [{ items: [{ ...validOrganic, domain: null }] }] },
    ],
    ["missing URL", { result: [{ items: [{ ...validOrganic, url: null }] }] }],
    [
      "invalid URL",
      { result: [{ items: [{ ...validOrganic, url: "not a URL" }] }] },
    ],
    [
      "invalid rank",
      { result: [{ items: [{ ...validOrganic, rank_group: 0 }] }] },
    ],
    [
      "fractional rank",
      { result: [{ items: [{ ...validOrganic, rank_group: 1.2 }] }] },
    ],
    [
      "unresolved redirect",
      {
        result: [
          {
            items: [
              validOrganic,
              {
                ...validOrganic,
                domain: "google.com",
                url: "https://google.com/goto?token=123",
              },
            ],
          },
        ],
      },
    ],
  ])(
    "rejects %s without a false not-found observation, preserving live billing",
    async (_label, task) => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockImplementation(async () => rankResponse(task));
      vi.stubGlobal("fetch", fetchMock);
      await expect(fetchRankCheckSerp(rankInput)).rejects.toMatchObject({
        name: "DataforseoChargedTaskError",
        billing: { costUsd: 0.002 },
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await expect(
        fetchRankCheckTaskResult({ ...rankInput, taskId: "task-a" }),
      ).resolves.toMatchObject({ status: "failed" });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );

  it("retains organic position rather than absolute SERP position", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        rankResponse({
          result: [
            {
              items: [
                { ...validOrganic, domain: "example.com", rank_absolute: 7 },
              ],
            },
          ],
        }),
      ),
    );
    await expect(fetchRankCheckSerp(rankInput)).resolves.toMatchObject({
      data: { position: 3, url: validOrganic.url },
    });
  });

  it.each([40102, 40501])(
    "accepts explicit no-search-results status %s",
    async (status_code) => {
      vi.stubGlobal(
        "fetch",
        vi.fn<typeof fetch>().mockImplementation(async () =>
          rankResponse({
            status_code,
            status_message: "No Search Results.",
            result: null,
          }),
        ),
      );
      await expect(fetchRankCheckSerp(rankInput)).resolves.toMatchObject({
        data: { position: null },
        billing: { costUsd: 0.002 },
      });
      await expect(
        fetchRankCheckTaskResult({ ...rankInput, taskId: "task-a" }),
      ).resolves.toMatchObject({
        status: "completed",
        result: { position: null },
      });
    },
  );

  it("does not treat invalid-field task failures as empty rankings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(async () =>
        rankResponse({
          status_code: 40501,
          status_message: "Invalid Field: 'target'.",
          result: null,
        }),
      ),
    );
    await expect(fetchRankCheckSerp(rankInput)).rejects.toMatchObject({
      name: "DataforseoChargedTaskError",
    });
    await expect(
      fetchRankCheckTaskResult({ ...rankInput, taskId: "task-a" }),
    ).resolves.toMatchObject({ status: "failed" });
  });

  it("accepts a valid unmatched SERP as checked-not-found with one paid read", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(rankResponse({ result: [{ items: [validOrganic] }] }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      fetchRankCheckSerp({ ...rankInput, targetDomain: "other.com" }),
    ).resolves.toMatchObject({ data: { position: null } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      parseDataforseoRequestBody(fetchMock.mock.calls[0]?.[1]),
    ).toMatchObject([{ device: "desktop", depth: 20 }]);
    expect(
      parseDataforseoRequestBody(fetchMock.mock.calls[0]?.[1]),
    ).not.toMatchObject([{ resolve_poisoned_results: true }]);
  });
});

describe("paid rank HTTP attempt boundary", () => {
  it.each(["live", "task_post"])(
    "sends one HTTP attempt for %s on 5xx",
    async (endpoint) => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockImplementation(
          async () => new Response("upstream failure", { status: 503 }),
        );
      vi.stubGlobal("fetch", fetchMock);
      const request =
        endpoint === "live"
          ? fetchRankCheckSerp(rankInput)
          : postRankCheckTasks({
              ...rankInput,
              tasks: [
                {
                  keywordId: rankInput.keywordId,
                  keyword: rankInput.keyword,
                  device: rankInput.device,
                },
              ],
            });
      await expect(request).rejects.toMatchObject({
        code: "UPSTREAM_UNAVAILABLE",
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
});

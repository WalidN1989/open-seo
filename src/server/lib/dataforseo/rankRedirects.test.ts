import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  fetchLiveSerp,
  fetchRankCheckSerp,
  fetchRankCheckTaskResult,
  postRankCheckTasks,
} from "./serp";

vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: vi.fn(async () => "test-api-key"),
}));
const input = {
  keyword: "example query",
  keywordId: "kw_1",
  targetDomain: "example.com",
  locationCode: 2840,
  languageCode: "en",
  depth: 20,
  device: "mobile" as const,
};
const organic = {
  type: "organic",
  domain: "www.example.com",
  url: "https://www.example.com/page",
  rank_group: 3,
  rank_absolute: 8,
};
function response(items: unknown[]) {
  return Response.json({
    status_code: 20000,
    tasks: [
      {
        status_code: 20000,
        cost: 0.0035,
        path: ["v3", "serp", "google", "organic", "live", "advanced"],
        result: [{ items }],
      },
    ],
  });
}
function requestBody(init: RequestInit | undefined): string {
  if (typeof init?.body !== "string")
    throw new Error("Expected an SDK JSON request body");
  return init.body;
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("rank-check native redirect resolution", () => {
  it("sends the resolver through actual SDK JSON and returns a fresh organic rank from one billed response", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async (_url, init) => {
        const requests = z
          .array(
            z.object({
              resolve_goto_urls: z.literal(true),
              keyword: z.literal("example query"),
              device: z.literal("mobile"),
              os: z.literal("android"),
              depth: z.literal(20),
              find_targets_in: z.array(z.literal("organic")),
              stop_crawl_on_match: z.array(
                z.object({
                  match_value: z.literal("example.com"),
                  match_type: z.literal("with_subdomains"),
                }),
              ),
            }),
          )
          .parse(JSON.parse(requestBody(init)));
        expect(requests).toHaveLength(1);
        expect(requestBody(init)).not.toContain("resolve_poisoned_results");
        return response([
          organic,
          {
            ...organic,
            domain: "other.example",
            url: "https://other.example/",
            rank_group: 4,
          },
        ]);
      });
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchRankCheckSerp(input)).resolves.toMatchObject({
      data: { keywordId: "kw_1", position: 3, url: organic.url },
      billing: { costUsd: 0.0035 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      "unresolved Google redirect",
      { domain: "google.com", url: "https://google.com/goto?opaque=value" },
      "unresolved Google redirect",
    ],
    [
      "conflicting domain",
      { domain: "example.com", url: "https://other.example/page" },
      "conflicting organic URL and domain",
    ],
    [
      "unsafe scheme",
      { domain: "example.com", url: "javascript:alert(1)" },
      "unsupported organic URL scheme",
    ],
    [
      "misleading authority",
      { domain: "example.com", url: "https://example.com@other.example/" },
      "conflicting organic URL and domain",
    ],
  ])(
    "keeps %s unchecked and preserves billed cost without following any URL",
    async (_name, overrides, message) => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockImplementation(async () =>
          response([{ ...organic, ...overrides }]),
        );
      vi.stubGlobal("fetch", fetchMock);
      const request = fetchRankCheckSerp(input);
      await expect(request).rejects.toMatchObject({
        name: "DataforseoChargedTaskError",
        billing: { costUsd: 0.0035 },
      });
      await expect(request).rejects.toThrow(message);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const outcome = await fetchRankCheckTaskResult({
        ...input,
        taskId: "queued-id",
      });
      expect(outcome.status).toBe("failed");
      if (outcome.status === "failed")
        expect(outcome.message).toContain(message);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(
        fetchMock.mock.calls.every(
          ([url]) =>
            typeof url === "string" &&
            url.startsWith("https://api.dataforseo.com/"),
        ),
      ).toBe(true);
    },
  );

  it("does not opt research or standard-priority queue submissions into the Live resolver", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => response([organic]));
    vi.stubGlobal("fetch", fetchMock);
    await fetchLiveSerp(input);
    expect(requestBody(fetchMock.mock.calls[0]?.[1])).not.toContain(
      "resolve_goto_urls",
    );
    fetchMock.mockResolvedValueOnce(
      Response.json({
        status_code: 20000,
        tasks: [
          {
            id: "queued-id",
            status_code: 20100,
            cost: 0.0006,
            data: { tag: "kw_1:mobile" },
          },
        ],
      }),
    );
    await expect(
      postRankCheckTasks({
        ...input,
        tasks: [
          { keywordId: "kw_1", keyword: input.keyword, device: "mobile" },
        ],
      }),
    ).resolves.toMatchObject({
      data: [{ taskId: "queued-id" }],
      billing: { costUsd: 0.0006 },
    });
    expect(requestBody(fetchMock.mock.calls[1]?.[1])).not.toContain(
      "resolve_goto_urls",
    );
    expect(requestBody(fetchMock.mock.calls[1]?.[1])).not.toContain(
      '"priority":2',
    );
  });
});

describe("rank-live request deadline", () => {
  function timedFetch(delayMs: number) {
    vi.useFakeTimers();
    vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
      const controller = new AbortController();
      setTimeout(
        () =>
          controller.abort(
            new DOMException("Deadline exceeded", "TimeoutError"),
          ),
        ms,
      );
      return controller.signal;
    });
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(() => resolve(response([organic])), delayMs);
          init?.signal?.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(init.signal?.reason);
            },
            { once: true },
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }
  it("allows a resolved result near the documented 260-second maximum without another paid call", async () => {
    const fetchMock = timedFetch(260_000);
    const request = fetchRankCheckSerp(input);
    const assertion = expect(request).resolves.toMatchObject({
      data: { position: 3 },
      billing: { costUsd: 0.0035 },
    });
    await vi.advanceTimersByTimeAsync(260_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("aborts a stalled live request at its bounded deadline without retrying it", async () => {
    const fetchMock = timedFetch(300_000);
    const assertion = expect(fetchRankCheckSerp(input)).rejects.toMatchObject({
      name: "TimeoutError",
    });
    await vi.advanceTimersByTimeAsync(280_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each(["research", "queue post"])(
    "retains the 60-second %s deadline",
    async (kind) => {
      const fetchMock = timedFetch(100_000);
      const request =
        kind === "research"
          ? fetchLiveSerp(input)
          : postRankCheckTasks({
              ...input,
              tasks: [
                { keywordId: "kw_1", keyword: input.keyword, device: "mobile" },
              ],
            });
      const assertion = expect(request).rejects.toMatchObject({
        name: "TimeoutError",
      });
      await vi.advanceTimersByTimeAsync(60_000);
      await assertion;
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
});

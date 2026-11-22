import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: vi.fn().mockResolvedValue("encoded-credentials"),
}));

import { onPageApi, serpApi, serpTaskApi } from "@/server/lib/dataforseo/core";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("DataForSEO OnPage transport", () => {
  it("does not retry a Lighthouse HTTP 5xx response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("upstream failure", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(onPageApi().lighthouseLiveJson([])).rejects.toMatchObject({
      code: "UPSTREAM_UNAVAILABLE",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("DataForSEO rank transport", () => {
  it.each(["live", "task_post"])(
    "does not retry paid %s submissions",
    async (endpoint) => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockImplementation(
          async () => new Response("upstream failure", { status: 503 }),
        );
      vi.stubGlobal("fetch", fetchMock);
      const request =
        endpoint === "live"
          ? serpTaskApi().googleOrganicLiveAdvanced([])
          : serpTaskApi().googleOrganicTaskPost([]);
      await expect(request).rejects.toMatchObject({
        code: "UPSTREAM_UNAVAILABLE",
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it("retains bounded transient retries for free task_get", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(
        async () => new Response("upstream failure", { status: 503 }),
      )
      .mockImplementationOnce(
        async () => new Response("upstream failure", { status: 502 }),
      )
      .mockResolvedValueOnce(Response.json({ status_code: 20000, tasks: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const request = serpApi().googleOrganicTaskGetAdvanced("task-id");
    const assertion = expect(request).resolves.toMatchObject({
      status_code: 20000,
    });
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

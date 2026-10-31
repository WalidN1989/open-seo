import { beforeEach, expect, it, vi } from "vitest";
import { startApifyMapsSearch, readApifyMapsResults } from "./integrations";
const connection = { providerKey: "apify", credentialReference: "TEST_MAPS" };
beforeEach(() => {
  process.env.TEST_MAPS_API_TOKEN = "test-secret";
});
it("starts asynchronously with bounded Maps inputs and bearer authentication", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json({ data: { id: "run1", status: "READY" } }),
    );
  await startApifyMapsSearch(
    connection,
    { query: "painters", location: "Brisbane, Australia", limit: 25 },
    fetcher,
  );
  expect(fetcher).toHaveBeenCalledWith(
    expect.stringContaining("waitForFinish=0"),
    expect.objectContaining({
      redirect: "manual",
      body: JSON.stringify({
        searchStringsArray: ["painters"],
        locationQuery: "Brisbane, Australia",
        maxCrawledPlacesPerSearch: 25,
        language: "en",
      }),
    }),
  );
});
it("uses direct URLs instead of a keyword search", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json({ data: { id: "run1", status: "READY" } }),
    );
  await startApifyMapsSearch(
    connection,
    {
      query: "Shared painters",
      limit: 1,
      mapsUrls: ["https://maps.app.goo.gl/example"],
    },
    fetcher,
  );
  const body = fetcher.mock.calls[0][1]?.body;
  expect(typeof body).toBe("string");
  if (typeof body !== "string") throw new Error("Expected JSON request body");
  expect(JSON.parse(body)).toMatchObject({
    startUrls: [{ url: "https://maps.app.goo.gl/example" }],
  });
});
it("gets dataset items only after a run has succeeded", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({
        data: { id: "run1", status: "SUCCEEDED", defaultDatasetId: "data1" },
      }),
    )
    .mockResolvedValueOnce(Response.json([{ title: "Painter" }]));
  expect(await readApifyMapsResults(connection, "run1", fetcher)).toEqual({
    pending: false,
    items: [{ title: "Painter" }],
  });
  expect(fetcher.mock.calls[1][0]).toBe(
    "https://api.apify.com/v2/datasets/data1/items?format=json&clean=true&limit=100",
  );
});
it("keeps a running search pending without fetching its partial dataset", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      data: { id: "run1", status: "RUNNING", defaultDatasetId: "data1" },
    }),
  );
  expect(await readApifyMapsResults(connection, "run1", fetcher)).toMatchObject(
    { pending: true },
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each(["FAILED", "ABORTED", "TIMED-OUT"])(
  "reports terminal status %s without importing",
  async (status) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ data: { id: "run1", status } }));
    await expect(
      readApifyMapsResults(connection, "run1", fetcher),
    ).rejects.toThrow(status.toLowerCase());
  },
);
it("does not expose credential-bearing provider errors or follow a redirect", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    new Response("test-secret", {
      status: 302,
      headers: { Location: "https://example.org" },
    }),
  );
  await expect(
    readApifyMapsResults(connection, "run1", fetcher),
  ).rejects.toThrow("refusing to follow");
  expect(fetcher).toHaveBeenCalledTimes(1);
});

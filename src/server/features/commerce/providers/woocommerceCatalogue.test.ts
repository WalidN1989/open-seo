import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/lib/connection-secrets", () => ({
  resolveConnectionCredential: (_connection: unknown, suffix: string) =>
    Promise.resolve(
      suffix === "BASE_URL" ? "https://store.example.test" : "test-value",
    ),
}));

const { catalogueProviderFor } = await import("./catalogueProviders");
const woo = catalogueProviderFor("woocommerce")!;
const connection = { providerKey: "woocommerce", credentialReference: null };

function respond(products: unknown[]) {
  return vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(JSON.stringify(products)));
}

describe("WooCommerce publication boundary", () => {
  it("reads all statuses without a modified filter, but imports only explicitly published products", async () => {
    const fetcher = respond([
      {
        id: 101,
        name: "Published",
        status: "publish",
        permalink: "https://store.example.test/product/published/",
      },
      { id: 102, name: "Draft", status: "draft" },
      { id: 103, name: "Private", status: "private" },
    ]);
    const page = await woo.fetchPage(
      connection,
      1,
      50,
      "2026-01-01T00:00:00Z",
      fetcher,
    );
    const url = fetcher.mock.calls[0][0];
    if (typeof url !== "string") throw new Error("Expected a URL string");
    const requested = new URL(url);
    expect(requested.searchParams.get("status")).toBe("any");
    expect(requested.searchParams.has("modified_after")).toBe(false);
    expect(page.drafts.map((row) => row.externalId)).toEqual(["101"]);
    expect(page.unpublishedExternalIds).toEqual(["102", "103"]);
    expect(page.sourceItemCount).toBe(3);
    expect(page.syncedItemCount).toBe(1);
    expect(page.done).toBe(true);
  });

  it("rejects a response missing publication status rather than importing it", async () => {
    await expect(
      woo.fetchPage(
        connection,
        1,
        50,
        null,
        respond([{ id: 101, name: "Unknown publication" }]),
      ),
    ).rejects.toThrow(/unexpected product shape/);
  });

  it("reports only published products in connection health", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("[]", {
        headers: { "x-wp-total": "20" },
      }),
    );
    expect(await woo.health(connection, fetcher)).toEqual({ productCount: 20 });
    const url = fetcher.mock.calls[0][0];
    if (typeof url !== "string") throw new Error("Expected a URL string");
    expect(new URL(url).searchParams.get("status")).toBe("publish");
  });
});

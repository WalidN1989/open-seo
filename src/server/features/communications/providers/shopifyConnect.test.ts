import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/lib/connection-secrets", () => ({
  resolveConnectionCredential: (
    _connection: unknown,
    suffix: string,
  ): Promise<string> =>
    Promise.resolve(
      suffix === "SHOP_DOMAIN" ? "d80e66.myshopify.com" : "shpat_token",
    ),
}));

const { testIntegrationConnection } = await import("./integrations");

const connection = {
  providerKey: "shopify",
  credentialReference: "BOOXWORM",
  credentials: null,
};

/** A fetch stub, using the repo's own pattern for typing one. */
function respond(body: unknown, status = 200) {
  return vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

describe("connecting a Shopify store", () => {
  it("authenticates against the store's own admin API", async () => {
    const fetcher = respond({ shop: { name: "BooXworm" } });
    const result = await testIntegrationConnection(connection, fetcher);
    expect(result.detail).toContain("BooXworm");
  });

  it("calls the shop endpoint with the token as a header", async () => {
    // Never as a query parameter: it would land in Shopify's access logs.
    const fetcher = respond({ shop: { name: "BooXworm" } });
    await testIntegrationConnection(connection, fetcher);
    const [url, init] = fetcher.mock.calls[0];
    // The provider always passes a plain string; normalising keeps the
    // assertion honest if that ever becomes a Request or URL.
    const requested = url instanceof Request ? url.url : url.toString();
    expect(requested).toContain("d80e66.myshopify.com/admin/api/");
    expect(requested).not.toContain("shpat_");
    expect(new Headers(init?.headers).get("X-Shopify-Access-Token")).toBe(
      "shpat_token",
    );
  });

  it("still reports a connection when the store has no name", async () => {
    const fetcher = respond({ shop: {} });
    const result = await testIntegrationConnection(connection, fetcher);
    expect(result.detail).toBe("Shopify store authenticated");
  });

  it("surfaces a rejected token rather than reporting success", async () => {
    const fetcher = respond({ errors: "Invalid API key or access token" }, 401);
    await expect(
      testIntegrationConnection(connection, fetcher),
    ).rejects.toThrow();
  });
});

describe("the store domain must be Shopify's own", () => {
  it("refuses a custom storefront domain", async () => {
    // Shopify's admin API only answers on the .myshopify.com host, so a custom
    // domain fails with a confusing network error rather than a clear one.
    vi.resetModules();
    vi.doMock("@/server/lib/connection-secrets", () => ({
      resolveConnectionCredential: (_c: unknown, suffix: string) =>
        Promise.resolve(
          suffix === "SHOP_DOMAIN" ? "shop.booxworm.lk" : "shpat_token",
        ),
    }));
    const { testIntegrationConnection: scoped } =
      await import("./integrations");
    await expect(scoped(connection, respond({ shop: {} }))).rejects.toThrow(
      /myshopify\.com/,
    );
  });

  it("accepts a domain pasted as a full URL", async () => {
    vi.resetModules();
    vi.doMock("@/server/lib/connection-secrets", () => ({
      resolveConnectionCredential: (_c: unknown, suffix: string) =>
        Promise.resolve(
          suffix === "SHOP_DOMAIN"
            ? "https://d80e66.myshopify.com/admin"
            : "shpat_token",
        ),
    }));
    const { testIntegrationConnection: scoped } =
      await import("./integrations");
    const result = await scoped(connection, respond({ shop: { name: "X" } }));
    expect(result.detail).toContain("X");
  });
});

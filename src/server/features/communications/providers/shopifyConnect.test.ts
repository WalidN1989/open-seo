import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/lib/connection-secrets", () => ({
  resolveConnectionCredential: (
    _connection: unknown,
    suffix: string,
  ): Promise<string> =>
    Promise.resolve(
      suffix === "SHOP_DOMAIN"
        ? "d80e66.myshopify.com"
        : suffix === "CLIENT_ID"
          ? "client-id"
          : "client-secret",
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

function connectedStore(body: unknown = { shop: { name: "BooXworm" } }) {
  return vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: "short-lived-access-token",
          expires_in: 86_399,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
}

describe("connecting a Shopify store", () => {
  it("authenticates against the store's own admin API", async () => {
    const fetcher = connectedStore();
    const result = await testIntegrationConnection(connection, fetcher);
    expect(result.detail).toContain("BooXworm");
  });

  it("exchanges the client secret, then keeps the token in a header", async () => {
    const fetcher = connectedStore();
    await testIntegrationConnection(connection, fetcher);
    const [tokenUrl, tokenInit] = fetcher.mock.calls[0];
    expect(tokenUrl.toString()).toContain("/admin/oauth/access_token");
    expect(tokenInit?.body?.toString()).toContain(
      "grant_type=client_credentials",
    );
    expect(tokenInit?.body?.toString()).toContain("client_id=client-id");
    expect(tokenInit?.body?.toString()).toContain(
      "client_secret=client-secret",
    );
    const [url, init] = fetcher.mock.calls[1];
    // The provider always passes a plain string; normalising keeps the
    // assertion honest if that ever becomes a Request or URL.
    const requested = url instanceof Request ? url.url : url.toString();
    expect(requested).toContain("d80e66.myshopify.com/admin/api/");
    expect(requested).not.toContain("short-lived-access-token");
    expect(new Headers(init?.headers).get("X-Shopify-Access-Token")).toBe(
      "short-lived-access-token",
    );
  });

  it("still reports a connection when the store has no name", async () => {
    const fetcher = connectedStore({ shop: {} });
    const result = await testIntegrationConnection(connection, fetcher);
    expect(result.detail).toBe("Shopify store authenticated");
  });

  it("surfaces a rejected token rather than reporting success", async () => {
    const fetcher = respond({ error: "invalid_client" }, 401);
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
          suffix === "SHOP_DOMAIN"
            ? "shop.booxworm.lk"
            : suffix === "CLIENT_ID"
              ? "client-id"
              : "client-secret",
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
            : suffix === "CLIENT_ID"
              ? "client-id"
              : "client-secret",
        ),
    }));
    const { testIntegrationConnection: scoped } =
      await import("./integrations");
    const result = await scoped(
      connection,
      connectedStore({ shop: { name: "X" } }),
    );
    expect(result.detail).toContain("X");
  });
});

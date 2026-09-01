import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/lib/connection-secrets", () => ({
  resolveConnectionCredential: (_c: unknown, suffix: string) =>
    Promise.resolve(
      suffix === "SHOP_DOMAIN" ? "d80e66.myshopify.com" : "shpat_token",
    ),
}));

const { catalogueProviderFor } = await import("./catalogueProviders");
const { normalizeShopDomain, plainText, toMinorUnits } =
  await import("./shopify");

const connection = {
  providerKey: "shopify",
  credentialReference: null,
  credentials: null,
};

function respond(products: unknown[]) {
  return vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify({ products }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
}

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: 1001,
    title: "The Daily Stoic",
    body_html: "<p>A book about <b>Stoicism</b>.</p>",
    product_type: "Books",
    handle: "the-daily-stoic",
    variants: [
      {
        id: 5001,
        title: "Default Title",
        sku: "BX-1",
        price: "2500.00",
        inventory_quantity: 7,
        inventory_management: "shopify",
      },
    ],
    ...overrides,
  };
}

const shopify = catalogueProviderFor("shopify")!;

describe("a Shopify product becomes one row per variant", () => {
  it("stores a single-variant product under the product's own name", async () => {
    // Shopify calls the only variant "Default Title", which is an
    // implementation detail, not something to show a customer.
    const page = await shopify.fetchPage(
      connection,
      0,
      50,
      null,
      respond([product()]),
    );
    expect(page.drafts).toHaveLength(1);
    expect(page.drafts[0].name).toBe("The Daily Stoic");
  });

  it("gives every variant its own row, price and stock", async () => {
    // The whole point: one price for an item sold in three sizes would be
    // wrong in the assistant's answer and wrong on the order.
    const page = await shopify.fetchPage(
      connection,
      0,
      50,
      null,
      respond([
        product({
          variants: [
            {
              id: 1,
              title: "Paperback",
              sku: "BX-P",
              price: "2500.00",
              inventory_quantity: 4,
              inventory_management: "shopify",
            },
            {
              id: 2,
              title: "Hardcover",
              sku: "BX-H",
              price: "4200.00",
              inventory_quantity: 1,
              inventory_management: "shopify",
            },
          ],
        }),
      ]),
    );
    expect(page.drafts).toHaveLength(2);
    expect(page.drafts.map((d) => d.name)).toEqual([
      "The Daily Stoic — Paperback",
      "The Daily Stoic — Hardcover",
    ]);
    expect(page.drafts.map((d) => d.salePriceMinor)).toEqual([
      250_000, 420_000,
    ]);
    expect(page.drafts.map((d) => d.stockTarget)).toEqual([4, 1]);
  });

  it("keys each row on the variant id, not the product id", async () => {
    // Two variants sharing the product id would collide on the unique index
    // and the second would overwrite the first.
    const page = await shopify.fetchPage(
      connection,
      0,
      50,
      null,
      respond([
        product({
          variants: [
            { id: 11, title: "A", sku: "A", price: "1.00" },
            { id: 22, title: "B", sku: "B", price: "2.00" },
          ],
        }),
      ]),
    );
    expect(page.drafts.map((d) => d.externalId)).toEqual(["11", "22"]);
  });

  it("leaves stock null when the store does not track it", async () => {
    // Null and zero are different answers: zero is sold out, null is nobody
    // is counting. Reconciling null to zero would empty the shelf.
    const page = await shopify.fetchPage(
      connection,
      0,
      50,
      null,
      respond([
        product({
          variants: [
            { id: 9, title: "Default Title", sku: "X", price: "10.00" },
          ],
        }),
      ]),
    );
    expect(page.drafts[0].stockTarget).toBeNull();
  });

  it("gives a variant with no SKU a stable one of its own", async () => {
    // Without it a second sync would insert the same variant again.
    const page = await shopify.fetchPage(
      connection,
      0,
      50,
      null,
      respond([
        product({
          id: 77,
          variants: [
            { id: 88, title: "Default Title", sku: null, price: "1.00" },
          ],
        }),
      ]),
    );
    expect(page.drafts[0].sku).toBe("SHOPIFY-77-88");
  });

  it("carries the storefront link for each variant", async () => {
    const page = await shopify.fetchPage(
      connection,
      0,
      50,
      null,
      respond([product()]),
    );
    expect(page.drafts[0].productUrl).toBe(
      "https://d80e66.myshopify.com/products/the-daily-stoic",
    );
  });
});

describe("resuming a Shopify sync", () => {
  it("reports the highest product id as the next cursor", async () => {
    // Shopify pages by since_id, so the cursor is a real product id rather
    // than an offset that shifts when the catalogue changes mid-sync.
    const page = await shopify.fetchPage(
      connection,
      0,
      50,
      null,
      respond([product({ id: 10 }), product({ id: 40 }), product({ id: 25 })]),
    );
    expect(page.nextCursor).toBe(40);
  });

  it("reports done when the page is short", async () => {
    const page = await shopify.fetchPage(
      connection,
      0,
      50,
      null,
      respond([product()]),
    );
    expect(page.done).toBe(true);
  });

  it("keeps the cursor when a page comes back empty", async () => {
    const page = await shopify.fetchPage(connection, 99, 50, null, respond([]));
    expect(page.nextCursor).toBe(99);
    expect(page.drafts).toEqual([]);
  });
});

describe("reading Shopify's own formats", () => {
  it("converts a decimal price to integer minor units", () => {
    expect(toMinorUnits("2500.00")).toBe(250_000);
    expect(toMinorUnits("19.99")).toBe(1999);
    expect(toMinorUnits(null)).toBe(0);
  });

  it("reduces an HTML description to text", () => {
    expect(plainText("<p>A book about <b>Stoicism</b>.</p>")).toBe(
      "A book about Stoicism.",
    );
    expect(plainText("Ryan &amp; Co")).toBe("Ryan & Co");
  });

  it("accepts a domain pasted as a URL and refuses a custom domain", () => {
    expect(normalizeShopDomain("https://Shop-1.myshopify.com/admin")).toBe(
      "shop-1.myshopify.com",
    );
    expect(() => normalizeShopDomain("shop.booxworm.lk")).toThrow(
      /myshopify\.com/,
    );
  });
});

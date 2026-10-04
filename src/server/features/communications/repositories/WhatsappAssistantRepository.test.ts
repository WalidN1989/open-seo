import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type * as RepositoryModule from "./WhatsappAssistantRepository";

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
let client: Client;
let Repo: typeof RepositoryModule.WhatsappAssistantRepository;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  vi.doMock("@/db", () => ({ db: drizzle(client) }));
  await client.executeMultiple(`
    CREATE TABLE commerce_products (
      id TEXT PRIMARY KEY, organization_id TEXT, name TEXT, description TEXT,
      sku TEXT, isbn TEXT, status TEXT, sale_price_minor INTEGER, product_url TEXT
    );
    CREATE TABLE commerce_inventory_balances (
      organization_id TEXT, product_id TEXT, quantity_on_hand INTEGER
    );
    INSERT INTO commerce_products VALUES
      ('perfect', 'books', 'The Let Them Theory: A Life-Changing Tool — Perfect', 'By Mel Robbins and Sawyer Robbins', 'BX-17', '9781401971366', 'active', 365000, 'https://books.test/let-them'),
      ('imperfect', 'books', 'The Let Them Theory: A Life-Changing Tool — Imperfect', 'By Mel Robbins and Sawyer Robbins', 'IMP-2544', null, 'active', 150000, 'https://books.test/let-them'),
      ('other-tenant', 'other', 'The Let Them Theory', 'By Mel Robbins', 'OTHER', null, 'active', 100, null),
      ('archived', 'books', 'The Let Them Theory', 'By Mel Robbins', 'OLD', null, 'archived', 100, null);
    INSERT INTO commerce_inventory_balances VALUES
      ('books', 'perfect', 2), ('books', 'perfect', 3), ('books', 'imperfect', 0),
      ('other', 'perfect', 100);
  `);
  ({ WhatsappAssistantRepository: Repo } =
    await import("./WhatsappAssistantRepository"));
});

afterAll(() => client.close());

describe("assistant catalogue search", () => {
  it("finds both editions when the cover query includes the author", async () => {
    const rows = await Repo.searchPricedProducts(
      "books",
      "The Let Them Theory by Mel Robbins",
    );
    expect(rows.map((row) => row.sku)).toEqual(["IMP-2544", "BX-17"]);
    expect(rows.map((row) => row.salePriceMinor)).toEqual([150000, 365000]);
    expect(rows.map((row) => row.quantityOnHand)).toEqual([0, 5]);
  });

  it("matches a punctuated title and author-only search", async () => {
    expect(
      await Repo.searchPricedProducts("books", '"The Let Them Theory"'),
    ).toHaveLength(2);
    expect(
      await Repo.searchPricedProducts("books", "Mel Robbins"),
    ).toHaveLength(2);
  });

  it("preserves exact identifiers and rejects unrelated queries", async () => {
    expect((await Repo.searchPricedProducts("books", "BX-17"))[0]?.sku).toBe(
      "BX-17",
    );
    expect(
      (await Repo.searchPricedProducts("books", "9781401971366"))[0]?.sku,
    ).toBe("BX-17");
    expect(
      await Repo.searchPricedProducts("books", "Think Like a Monk"),
    ).toEqual([]);
  });
});

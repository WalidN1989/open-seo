import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import Papa from "papaparse";
import { readFileSync } from "node:fs";
import { createClient } from "@libsql/client";
import { getTableColumns } from "drizzle-orm";
import { createTenancyFixture, ORG_A, ORG_B } from "./fixture";
import { parseLegacyOrders } from "@/server/features/commerce/providers/legacyOrders";
import type * as Module from "@/server/features/commerce/repositories/LegacyOrderRepository";
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
let fixture: Awaited<ReturnType<typeof createTenancyFixture>>;
let repo: typeof Module.LegacyOrderRepository;
const sourceStates = ["returned", "returned_refunded", "refunded", "pending"];
function files() {
  const orders = Papa.unparse(
    sourceStates.map((delivery_status, index) => ({
      order_number: `LEGACY-${index}`,
      created_at: "2026-10-01T10:00:00+05:30",
      delivery_status,
      customer_name: "Fixture Customer",
      customer_email: "fixture@example.test",
      customer_mobile: "+94770000000",
      billing_address: "",
      payment_mode: "koko",
      payment_terms: "paid online",
      subtotal: "10.00",
      grand_total: "10.00",
      discount_amount: "0",
      shipping_amount: "0",
      currency: "LKR",
    })),
  );
  const lines = Papa.unparse(
    sourceStates.map((_status, index) => ({
      order_number: `LEGACY-${index}`,
      line_item_id: `legacy-line-${index}`,
      sku: "",
      title: "Fixture Book",
      quantity: 1,
      unit_price: "10.00",
      line_total: "10.00",
      currency: "LKR",
    })),
  );
  return { orders, lines };
}
beforeAll(async () => {
  fixture = await createTenancyFixture();
  vi.doMock("@/db", () => ({ db: fixture.db }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: fixture.db }));
  vi.doMock("@/db/pg/client", () => ({ pgDb: null }));
  const schema = await import("@/db/schema");
  await fixture.db.insert(schema.integrationConnections).values({
    id: "legacy-profile",
    organizationId: ORG_A,
    providerKey: "shopify",
    displayName: "Fixture shop",
    status: "connected",
  });
  ({ LegacyOrderRepository: repo } =
    await import("@/server/features/commerce/repositories/LegacyOrderRepository"));
});
afterAll(() => fixture.client.close());
describe("legacy snapshot format boundaries", () => {
  it("preserves actual payment method and source outcomes without inferring online payment", async () => {
    const { orders, lines } = files();
    const parsed = parseLegacyOrders(orders, lines);
    for (const order of parsed) {
      await repo.importOrder(
        ORG_A,
        "legacy-profile",
        `default:${ORG_A}`,
        order,
      );
      await repo.importOrder(
        ORG_A,
        "legacy-profile",
        `default:${ORG_A}`,
        order,
      );
    }
    const schema = await import("@/db/schema");
    const saved = (
      await fixture.db.select().from(schema.commerceOrders)
    ).filter((row) => row.integrationConnectionId === "legacy-profile");
    expect(saved).toHaveLength(4);
    expect(saved.find((row) => row.orderNumber === "LEGACY-0")).toMatchObject({
      status: "returned",
      paymentStatus: "unpaid",
      fulfilmentStatus: "returned",
      paymentMethod: "koko",
      paymentTerms: "paid online",
      paidMinor: 0,
      shippingCity: null,
    });
    expect(saved.find((row) => row.orderNumber === "LEGACY-1")).toMatchObject({
      status: "returned",
      paymentStatus: "refunded",
      approvalStatus: "rejected",
      paidMinor: 0,
    });
    expect(saved.find((row) => row.orderNumber === "LEGACY-2")).toMatchObject({
      status: "confirmed",
      paymentStatus: "refunded",
      approvalStatus: "rejected",
      paidMinor: 0,
    });
    expect(saved.find((row) => row.orderNumber === "LEGACY-3")).toMatchObject({
      status: "confirmed",
      paymentStatus: "unpaid",
      paymentMethod: "koko",
      paymentTerms: "paid online",
      paidMinor: 0,
    });
    expect(
      (await fixture.db.select().from(schema.commerceOrders)).filter(
        (row) =>
          row.organizationId === ORG_B &&
          row.integrationConnectionId === "legacy-profile",
      ),
    ).toEqual([]);
    expect(
      (await fixture.db.select().from(schema.commerceOrderEffects)).filter(
        (row) => saved.some((order) => order.id === row.orderId),
      ),
    ).toEqual([]);
    expect(
      (await fixture.db.select().from(schema.invoiceLineItems)).filter((row) =>
        row.invoiceId.startsWith("retail:legacy:"),
      ),
    ).toEqual([]);
    expect(
      (await fixture.db.select().from(schema.commerceLoyaltyEntries)).filter(
        (row) => saved.some((order) => order.id === row.orderId),
      ),
    ).toEqual([]);
  });
  it("rejects unresolved missing lines instead of inventing a basket", () => {
    const { orders, lines } = files();
    expect(() =>
      parseLegacyOrders(orders, lines.split("\n").slice(0, 2).join("\n")),
    ).toThrow();
  });
});

describe("payment terms schema upgrades", () => {
  it("keeps existing orders null and matches both dialects", async () => {
    const client = createClient({ url: ":memory:" });
    try {
      await client.execute(
        "CREATE TABLE commerce_orders (id TEXT PRIMARY KEY, payment_method TEXT)",
      );
      await client.execute(
        "INSERT INTO commerce_orders VALUES ('existing', 'koko')",
      );
      await client.execute(
        readFileSync("drizzle/0105_fluffy_synch.sql", "utf8"),
      );
      expect(
        (await client.execute("SELECT * FROM commerce_orders")).rows[0],
      ).toMatchObject({
        id: "existing",
        payment_method: "koko",
        payment_terms: null,
      });
      const sqlite = await import("@/db/business.schema");
      const postgres = await import("@/db/pg/business.schema");
      for (const table of [sqlite.commerceOrders, postgres.commerceOrders]) {
        const column = getTableColumns(table).paymentTerms;
        expect(column.name).toBe("payment_terms");
        expect(column.notNull).toBe(false);
        expect(column.hasDefault).toBe(false);
      }
      expect(
        readFileSync("drizzle-pg/0084_pretty_nuke.sql", "utf8").trim(),
      ).toBe('ALTER TABLE "commerce_orders" ADD COLUMN "payment_terms" text;');
    } finally {
      client.close();
    }
  });
});

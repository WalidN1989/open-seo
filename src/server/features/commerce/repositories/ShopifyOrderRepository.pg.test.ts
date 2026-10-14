import { beforeEach, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/pg-proxy";
vi.mock("cloudflare:workers", () => ({
  env: { DATABASE_PROVIDER: "postgres" },
}));
vi.mock("@/db", () => ({
  db: { select: () => ({ from: () => ({ where: async () => [] }) }) },
}));
const state = vi.hoisted(() => ({
  statements: [] as { sql: string; params: unknown[] }[],
}));
vi.mock("@/db/runBatch", () => ({
  runBatch: async (build: (tx: unknown) => Promise<unknown>[]) => {
    const pg = drizzle(async (query, params) => {
      state.statements.push({ sql: query, params });
      return { rows: [] };
    });
    for (const query of build(pg)) await query;
  },
}));
beforeEach(() => {
  state.statements = [];
});
it.each([undefined, "123"])(
  "types nullable variant parameters for PostgreSQL even when variant is %s",
  async (variantId) => {
    const { ShopifyOrderRepository } =
      await import("@/server/features/commerce/repositories/ShopifyOrderRepository");
    await ShopifyOrderRepository.ingest(
      "diagnostic-org",
      "diagnostic-connection",
      "diagnostic-branch",
      {
        id: "1",
        order_number: "1",
        created_at: "2026-10-14T00:00:00Z",
        updated_at: "2026-10-14T00:00:00Z",
        currency: "LKR",
        financial_status: "paid",
        payment_gateway_names: [],
        total_price: 1000,
        total_discounts: 0,
        total_tax: 0,
        taxes_included: false,
        total_shipping_price_set: { shop_money: { amount: 0 } },
        shipping_lines: [],
        line_items: [
          {
            id: "2",
            variant_id: variantId,
            title: "Synthetic",
            quantity: 1,
            price: 1000,
          },
        ],
        fulfillments: [],
      },
    );
    const insert = state.statements.find((query) =>
      query.sql.startsWith('insert into "commerce_order_lines"'),
    );
    expect(insert).toBeDefined();
    // PostgreSQL 42P18: a standalone $parameter IS NULL has no inferred SQL type.
    expect(insert!.sql).not.toMatch(/\$\d+ is null/i);
    const match = insert!.sql.match(/cast\(\$(\d+) as text\) is null/i);
    expect(match).not.toBeNull();
    expect(insert!.params[Number(match![1]) - 1]).toBe(variantId ?? null);
  },
);

import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createTenancyFixture, ORG_A, ORG_B } from "./fixture";
import type * as OrderModule from "@/server/features/commerce/services/OrderService";
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
let fixture: Awaited<ReturnType<typeof createTenancyFixture>>;
let orders: typeof OrderModule.OrderService;
const listSchema = z.object({
  found: z.boolean(),
  hasMore: z.boolean(),
  orders: z.array(z.object({ orderId: z.string() })),
});
beforeAll(async () => {
  fixture = await createTenancyFixture();
  const db = fixture.db;
  vi.doMock("@/db", () => ({ db }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: db }));
  vi.doMock("@/db/pg/client", () => ({ pgDb: null }));
  const schema = await import("@/db/schema");
  await db.insert(schema.commerceOrders).values(
    Array.from({ length: 7 }, (_, i) => ({
      id: `recent-${i}`,
      organizationId: ORG_A,
      branchId: `default:${ORG_A}`,
      orderNumber: `ORD-${i}`,
      customerPhone: "+94771111111",
      customerEmail: "private@example.test",
      shippingLine1: "Private address",
      currency: "LKR",
      totalMinor: 1000,
      createdAt: `2026-10-${String(i + 1).padStart(2, "0")}T12:00:00.000Z`,
    })),
  );
  ({ OrderService: orders } =
    await import("@/server/features/commerce/services/OrderService"));
});
afterAll(() => fixture.client.close());
describe("sender-first customer order lookup", () => {
  it("finds the latest five orders without an ID and truthfully indicates more", async () => {
    const text = await orders.lookupCustomerOrder(
      ORG_A,
      "whatsapp:+94771111111",
    );
    const result = listSchema.parse(JSON.parse(text));
    expect(result).toMatchObject({ found: true, hasMore: true });
    expect(result.orders.map((o) => o.orderId)).toEqual([
      "ORD-6",
      "ORD-5",
      "ORD-4",
      "ORD-3",
      "ORD-2",
    ]);
    expect(text).not.toContain("private@example.test");
    expect(text).not.toContain("Private address");
  });
  it("never returns another sender's or another workspace's order list", async () => {
    expect(
      listSchema.parse(
        JSON.parse(await orders.lookupCustomerOrder(ORG_A, "+94772222222")),
      ),
    ).toMatchObject({ found: false, orders: [] });
    expect(
      listSchema.parse(
        JSON.parse(await orders.lookupCustomerOrder(ORG_B, "+94771111111")),
      ),
    ).toMatchObject({ found: false, orders: [] });
  });
  it("keeps explicit order IDs bound to the same sender", async () => {
    expect(
      JSON.parse(
        await orders.lookupCustomerOrder(ORG_A, "+94771111111", "ORD-6"),
      ),
    ).toMatchObject({ found: true, orderId: "ORD-6" });
    expect(
      JSON.parse(
        await orders.lookupCustomerOrder(ORG_A, "+94772222222", "ORD-6"),
      ),
    ).toMatchObject({ found: false });
  });
});

import type * as Service from "@/server/features/commerce/services/OrderService";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  createTenancyFixture,
  ORG_A,
  ORG_B,
  ORDER_A,
  PRODUCT_A,
  CONTACT_A,
} from "./fixture";
import type * as Module from "@/server/features/commerce/repositories/OrderRepository";
import type * as Schema from "@/db/schema";
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
let fixture: Awaited<ReturnType<typeof createTenancyFixture>>;
let repo: typeof Module.OrderRepository;
let Orders: typeof Service.OrderService;
let schema: typeof Schema;
beforeAll(async () => {
  fixture = await createTenancyFixture();
  vi.doMock("@/db", () => ({ db: fixture.db }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: fixture.db }));
  vi.doMock("@/db/pg/client", () => ({ pgDb: null }));
  schema = await import("@/db/schema");
  ({ OrderRepository: repo } =
    await import("@/server/features/commerce/repositories/OrderRepository"));
  ({ OrderService: Orders } =
    await import("@/server/features/commerce/services/OrderService"));
});
afterAll(() => fixture.client.close());
const revision = "2026-10-14T00:00:00.000Z";
const movement = {
  branchId: `default:${ORG_A}`,
  productId: PRODUCT_A,
  movementType: "sale" as const,
  quantityDelta: -2,
  referenceType: "native-test-confirm",
  referenceId: ORDER_A,
};
async function resetDraft() {
  await fixture.db
    .update(schema.commerceOrders)
    .set({ status: "draft", updatedAt: revision })
    .where(eq(schema.commerceOrders.id, ORDER_A));
}
async function stock() {
  const rows = await fixture.db.select().from(schema.commerceInventoryBalances);
  return rows.find(
    (row) => row.organizationId === ORG_A && row.productId === PRODUCT_A,
  )?.quantityOnHand;
}
describe("prepared native stock/state transaction", () => {
  it("applies a repeated confirmation only once", async () => {
    await resetDraft();
    const before = await stock();
    await repo.transitionNative(ORG_A, ORDER_A, {
      revision,
      fromStatus: "draft",
      values: { status: "confirmed", fulfilmentStatus: "fulfilled" },
      movements: [movement],
    });
    await repo.transitionNative(ORG_A, ORDER_A, {
      revision,
      fromStatus: "draft",
      values: { status: "confirmed", fulfilmentStatus: "fulfilled" },
      movements: [movement],
    });
    expect(await stock()).toBe(Number(before) - 2);
    expect((await repo.getOrder(ORG_A, ORDER_A))?.approvalStatus).toBe(
      "approved",
    );
  });
  it("cannot overwrite a cancelled state or mutate another tenant", async () => {
    await resetDraft();
    const before = await stock();
    await repo.transitionNative(ORG_A, ORDER_A, {
      revision,
      fromStatus: "draft",
      values: { status: "cancelled", fulfilmentStatus: "unfulfilled" },
      movements: [],
    });
    await repo.transitionNative(ORG_A, ORDER_A, {
      revision,
      fromStatus: "draft",
      values: { status: "confirmed", fulfilmentStatus: "fulfilled" },
      movements: [{ ...movement, referenceType: "native-test-race" }],
    });
    await repo.transitionNative(ORG_B, ORDER_A, {
      revision,
      fromStatus: "draft",
      values: { status: "confirmed", fulfilmentStatus: "fulfilled" },
      movements: [{ ...movement, referenceType: "native-test-foreign" }],
    });
    expect(await stock()).toBe(before);
    expect((await repo.getOrder(ORG_A, ORDER_A))?.status).toBe("cancelled");
  });
  it("serializes concurrent confirmation and cancellation without orphan stock moves", async () => {
    await resetDraft();
    const before = await stock();
    await Promise.allSettled([
      repo.transitionNative(ORG_A, ORDER_A, {
        revision,
        fromStatus: "draft",
        values: { status: "confirmed", fulfilmentStatus: "fulfilled" },
        movements: [{ ...movement, referenceType: "native-test-concurrent" }],
      }),
      repo.transitionNative(ORG_A, ORDER_A, {
        revision,
        fromStatus: "draft",
        values: { status: "cancelled", fulfilmentStatus: "unfulfilled" },
        movements: [],
      }),
    ]);
    const order = await repo.getOrder(ORG_A, ORDER_A);
    expect(["confirmed", "cancelled"]).toContain(order?.status);
    expect(await stock()).toBe(
      order?.status === "confirmed" ? Number(before) - 2 : before,
    );
  });
  it("rolls back state and movement when stock is insufficient", async () => {
    await resetDraft();
    const before = await stock();
    await expect(
      repo.transitionNative(ORG_A, ORDER_A, {
        revision,
        fromStatus: "draft",
        values: { status: "confirmed", fulfilmentStatus: "fulfilled" },
        movements: [
          {
            ...movement,
            quantityDelta: -1000,
            referenceType: "native-test-insufficient",
          },
        ],
      }),
    ).rejects.toThrow();
    expect(await stock()).toBe(before);
    expect((await repo.getOrder(ORG_A, ORDER_A))?.status).toBe("draft");
    expect(
      (await fixture.db.select().from(schema.commerceStockMovements)).some(
        (row) => row.referenceType === "native-test-insufficient",
      ),
    ).toBe(false);
  });
  it("reverses earned points exactly once inside cancellation", async () => {
    await resetDraft();
    await fixture.db.insert(schema.commerceLoyaltyEntries).values({
      id: "native-earned",
      organizationId: ORG_A,
      orderId: ORDER_A,
      contactId: CONTACT_A,
      sourceId: "native-earned",
      kind: "earned",
      points: 10,
    });
    await repo.transitionNative(ORG_A, ORDER_A, {
      revision,
      fromStatus: "draft",
      values: { status: "cancelled", fulfilmentStatus: "unfulfilled" },
      movements: [],
    });
    await repo.transitionNative(ORG_A, ORDER_A, {
      revision,
      fromStatus: "draft",
      values: { status: "cancelled", fulfilmentStatus: "unfulfilled" },
      movements: [],
    });
    const reversed = (
      await fixture.db.select().from(schema.commerceLoyaltyEntries)
    ).filter((row) => row.kind === "reversed");
    expect(reversed).toHaveLength(1);
    expect(reversed[0].points).toBe(-10);
  });
  it("looks up native ORD IDs only for their exact owned sender", async () => {
    const number = "ORD-E7DB6323C31142A19921456766524321";
    await fixture.db.insert(schema.commerceOrders).values({
      id: "native-owned",
      organizationId: ORG_A,
      branchId: `default:${ORG_A}`,
      orderNumber: number,
      currency: "LKR",
      customerPhone: "+94771111111",
      status: "confirmed",
      approvalStatus: "approved",
    });
    expect(
      JSON.parse(
        await Orders.lookupCustomerOrder(
          ORG_A,
          "whatsapp:+94771111111",
          number,
        ),
      ),
    ).toMatchObject({ found: true, orderId: number });
    expect(
      JSON.parse(
        await Orders.lookupCustomerOrder(ORG_A, "+94772222222", number),
      ),
    ).toMatchObject({ found: false });
    expect(
      JSON.parse(
        await Orders.lookupCustomerOrder(ORG_B, "+94771111111", number),
      ),
    ).toMatchObject({ found: false });
  });
});

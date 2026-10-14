import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  createTenancyFixture,
  ORG_A,
  ORG_B,
  ORDER_A,
  PRODUCT_A,
  USER_OWNER_A,
} from "./fixture";
import type * as DraftModule from "@/server/features/commerce/repositories/OrderDraftRepository";
import type * as OrderModule from "@/server/features/commerce/repositories/OrderRepository";
import type * as Schema from "@/db/schema";
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
let fixture: Awaited<ReturnType<typeof createTenancyFixture>>;
let Drafts: typeof DraftModule.OrderDraftRepository;
let Orders: typeof OrderModule.OrderRepository;
let schema: typeof Schema;
const revision = "2026-10-14T00:00:00.000Z";
beforeAll(async () => {
  fixture = await createTenancyFixture();
  vi.doMock("@/db", () => ({ db: fixture.db }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: fixture.db }));
  vi.doMock("@/db/pg/client", () => ({ pgDb: null }));
  schema = await import("@/db/schema");
  ({ OrderDraftRepository: Drafts } =
    await import("@/server/features/commerce/repositories/OrderDraftRepository"));
  ({ OrderRepository: Orders } =
    await import("@/server/features/commerce/repositories/OrderRepository"));
});
afterAll(() => fixture.client.close());
async function reset() {
  await fixture.db
    .update(schema.commerceOrders)
    .set({
      status: "draft",
      approvalStatus: "pending",
      paymentStatus: "unpaid",
      paidMinor: 0,
      externalSource: null,
      integrationConnectionId: null,
      externalBasketKey: "stable-create-fingerprint",
      updatedAt: revision,
    })
    .where(eq(schema.commerceOrders.id, ORDER_A));
}
function input(amount = 300) {
  return {
    orderId: ORDER_A,
    revision,
    header: {
      branchId: `default:${ORG_A}`,
      contactId: null,
      customerName: null,
      customerPhone: null,
      customerEmail: null,
      shippingAddress: "Edited",
      shippingCity: "Colombo",
      pickup: false,
      paymentMethod: "cash" as const,
      operationsConnectionId: null,
      note: "Edited",
      subtotalMinor: amount,
      discountMinor: 0,
      deliveryMinor: 0,
      taxMinor: 0,
      totalMinor: amount,
    },
    lines: [
      {
        productId: PRODUCT_A,
        description: `Basket ${amount}`,
        sku: "ALPHA-1",
        quantity: 1,
        unitPriceMinor: amount,
        lineTotalMinor: amount,
      },
    ],
  };
}
describe("atomic native draft editing", () => {
  it("replaces header and lines without changing identity, stock or effects", async () => {
    await reset();
    const before = await Orders.getOrder(ORG_A, ORDER_A);
    const balances = await fixture.db
      .select()
      .from(schema.commerceInventoryBalances);
    expect(await Drafts.edit(ORG_A, USER_OWNER_A, input())).toBe(true);
    const after = await Orders.getOrder(ORG_A, ORDER_A);
    expect(after).toMatchObject({
      id: before?.id,
      orderNumber: before?.orderNumber,
      externalSource: null,
      externalBasketKey: "stable-create-fingerprint",
      status: "draft",
      totalMinor: 300,
    });
    expect(after?.updatedAt).not.toBe(revision);
    expect(await Orders.listLines(ORG_A, ORDER_A)).toMatchObject([
      { description: "Basket 300", lineTotalMinor: 300 },
    ]);
    expect(
      await fixture.db.select().from(schema.commerceInventoryBalances),
    ).toEqual(balances);
    expect(
      await fixture.db.select().from(schema.commerceStockMovements),
    ).toHaveLength(0);
    expect(
      await fixture.db.select().from(schema.commerceOrderEffects),
    ).toHaveLength(0);
    expect(
      await fixture.db.select().from(schema.commerceLoyaltyEntries),
    ).toHaveLength(0);
  });
  it("rejects tenant, stale revision, paid and Shopify-owned mutations", async () => {
    await reset();
    expect(await Drafts.edit(ORG_B, USER_OWNER_A, input())).toBe(false);
    expect(
      await Drafts.edit(ORG_A, USER_OWNER_A, { ...input(), revision: "old" }),
    ).toBe(false);
    await fixture.db
      .update(schema.commerceOrders)
      .set({ paidMinor: 1 })
      .where(eq(schema.commerceOrders.id, ORDER_A));
    expect(await Drafts.edit(ORG_A, USER_OWNER_A, input())).toBe(false);
    await reset();
    await fixture.db
      .update(schema.commerceOrders)
      .set({ externalSource: "shopify" })
      .where(eq(schema.commerceOrders.id, ORDER_A));
    expect(await Drafts.edit(ORG_A, USER_OWNER_A, input())).toBe(false);
  });
  it("allows only one concurrent revision and keeps its basket coherent", async () => {
    await reset();
    const results = await Promise.all([
      Drafts.edit(ORG_A, USER_OWNER_A, input(400)),
      Drafts.edit(ORG_A, USER_OWNER_A, input(500)),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const order = await Orders.getOrder(ORG_A, ORDER_A);
    expect(await Orders.listLines(ORG_A, ORDER_A)).toMatchObject([
      { lineTotalMinor: order?.totalMinor },
    ]);
  });
  it("rejects confirmation prepared from a stale basket and edits after confirmation", async () => {
    await reset();
    const before = await fixture.db
      .select()
      .from(schema.commerceInventoryBalances);
    await Drafts.edit(ORG_A, USER_OWNER_A, input(600));
    await Orders.transitionNative(ORG_A, ORDER_A, {
      revision,
      fromStatus: "draft",
      values: { status: "confirmed", fulfilmentStatus: "unfulfilled" },
      movements: [
        {
          branchId: `default:${ORG_A}`,
          productId: PRODUCT_A,
          movementType: "sale",
          quantityDelta: -1,
          referenceType: "edit-stale-confirm",
          referenceId: ORDER_A,
        },
      ],
    });
    expect((await Orders.getOrder(ORG_A, ORDER_A))?.status).toBe("draft");
    expect(
      await fixture.db.select().from(schema.commerceInventoryBalances),
    ).toEqual(before);
    const current = await Orders.getOrder(ORG_A, ORDER_A);
    await Orders.transitionNative(ORG_A, ORDER_A, {
      revision: current.updatedAt,
      fromStatus: "draft",
      values: { status: "confirmed", fulfilmentStatus: "unfulfilled" },
      movements: [],
    });
    expect(
      await Drafts.edit(ORG_A, USER_OWNER_A, {
        ...input(),
        revision: (await Orders.getOrder(ORG_A, ORDER_A)).updatedAt,
      }),
    ).toBe(false);
  });
});

import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  createTenancyFixture,
  ORG_A,
  ORG_B,
  USER_OWNER_A,
  USER_OWNER_B,
  USER_STAFF_A,
  PRODUCT_A,
} from "./fixture";
import type * as ReturnsModule from "@/server/features/commerce/services/OrderReturnsService";
import type * as GapsModule from "@/server/features/commerce/services/OrderGapService";
import type * as Schema from "@/db/schema";
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
let fixture: Awaited<ReturnType<typeof createTenancyFixture>>;
let returns: typeof ReturnsModule.OrderReturnsService;
let gaps: typeof GapsModule.OrderGapService;
let schema: typeof Schema;
beforeAll(async () => {
  fixture = await createTenancyFixture();
  vi.doMock("@/db", () => ({ db: fixture.db }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: fixture.db }));
  vi.doMock("@/db/pg/client", () => ({ pgDb: null }));
  schema = await import("@/db/schema");
  ({ OrderReturnsService: returns } =
    await import("@/server/features/commerce/services/OrderReturnsService"));
  ({ OrderGapService: gaps } =
    await import("@/server/features/commerce/services/OrderGapService"));
  await fixture.db.insert(schema.commerceOrders).values([
    {
      id: "history_delivered",
      organizationId: ORG_A,
      branchId: `default:${ORG_A}`,
      orderNumber: "SHOP-100",
      externalSource: "shopify",
      status: "confirmed",
      createdAt: "2026-10-01 00:00:00",
      updatedAt: "2026-10-14T10:00:00.000Z",
    },
    {
      id: "history_returned",
      organizationId: ORG_A,
      branchId: `default:${ORG_A}`,
      orderNumber: "SHOP-102",
      externalSource: "shopify",
      status: "returned",
      paymentStatus: "refunded",
      createdAt: "2026-10-12T10:00:00.000Z",
      updatedAt: "2026-10-14T10:00:00.000Z",
    },
    {
      id: "history_cancelled",
      organizationId: ORG_A,
      branchId: `default:${ORG_A}`,
      orderNumber: "SHOP-103",
      externalSource: "shopify",
      status: "cancelled",
      cancelledAt: "2026-10-14T09:00:00.000Z",
      createdAt: "2026-10-13T10:00:00.000Z",
    },
    {
      id: "history_previous_month",
      organizationId: ORG_A,
      branchId: `default:${ORG_A}`,
      orderNumber: "ORD-OLD",
      status: "returned",
      createdAt: "2026-09-20T10:00:00.000Z",
      updatedAt: "2026-10-14T10:00:00.000Z",
    },
    {
      id: "history_foreign_tracking",
      organizationId: ORG_A,
      branchId: `default:${ORG_A}`,
      orderNumber: "ORD-NOTDELIVERED",
      status: "confirmed",
      createdAt: "2026-10-13T10:00:00.000Z",
    },
  ]);
  await fixture.db.insert(schema.commerceOrderShipments).values([
    {
      id: "history_tracking_delivered",
      organizationId: ORG_A,
      orderId: "history_delivered",
      provider: "Citypak",
      trackingNumber: "D100",
      status: "DELIVERED",
      lastEventAt: "2026-10-14T08:00:00.000Z",
    },
    {
      id: "history_tracking_returned",
      organizationId: ORG_A,
      orderId: "history_returned",
      provider: "Citypak",
      trackingNumber: "D102",
      status: "RETURNED",
      lastEventAt: "2026-10-14T09:00:00.000Z",
      reason: "Customer rejected delivery",
    },
    {
      id: "history_tracking_foreign",
      organizationId: ORG_B,
      orderId: "history_foreign_tracking",
      provider: "Citypak",
      trackingNumber: "PRIVATE",
      status: "DELIVERED",
      reason: "Private reason",
    },
  ]);
  await fixture.db
    .insert(schema.commerceStockMovements)
    .values({
      id: "history_stock_restored",
      organizationId: ORG_A,
      branchId: `default:${ORG_A}`,
      productId: PRODUCT_A,
      movementType: "return",
      quantityDelta: 1,
      referenceId: "history_returned",
      referenceType: "order_return",
    });
});
afterAll(() => fixture.client.close());
describe("Returns and Refunds history", () => {
  it("filters by order creation month, counts statuses and preserves unknown financial values", async () => {
    const data = await returns.history(ORG_A, USER_OWNER_A, {
      month: "2026-10",
      category: "all",
      limit: 50,
      offset: 0,
    });
    expect(data.counts).toEqual({
      delivered: 1,
      returned: 1,
      refunded: 1,
      cancelled: 1,
    });
    expect(data.total).toBe(3);
    expect(data.rows.map((row) => row.id)).not.toContain(
      "history_previous_month",
    );
    expect(data.rows.map((row) => row.id)).not.toContain(
      "history_foreign_tracking",
    );
    expect(data.courierExpenseMinor).toBeNull();
    expect(data.refundedMinor).toBeNull();
    const returned = data.rows.find((row) => row.id === "history_returned")!;
    expect(returned).toMatchObject({
      status: "returned_refunded",
      inventoryRestored: true,
      refundMinor: null,
      courierExpenseMinor: null,
      reason: "Customer rejected delivery",
      date: "2026-10-14T09:00:00.000Z",
    });
    expect(
      data.rows.find((row) => row.id === "history_cancelled")
        ?.inventoryRestored,
    ).toBeNull();
  });
  it("filters types and pages independently of monthly counts", async () => {
    const data = await returns.history(ORG_A, USER_OWNER_A, {
      month: "2026-10",
      category: "refunded",
      limit: 1,
      offset: 0,
    });
    expect(data.rows.map((row) => row.id)).toEqual(["history_returned"]);
    expect(data.counts.delivered).toBe(1);
    expect(
      (
        await returns.history(ORG_A, USER_OWNER_A, {
          month: "2026-10",
          category: "all",
          limit: 1,
          offset: 1,
        })
      ).rows[0].id,
    ).toBe("history_returned");
    expect(
      (
        await returns.history(ORG_B, USER_OWNER_B, {
          month: "2026-10",
          category: "all",
          limit: 50,
          offset: 0,
        })
      ).rows,
    ).toEqual([]);
    await expect(
      returns.history(ORG_A, USER_OWNER_B, {
        month: "2026-10",
        category: "all",
        limit: 50,
        offset: 0,
      }),
    ).rejects.toThrow();
  });
});
describe("Missing/Canceled local gap annotations", () => {
  it("marks and restores a gap once with audit and no order/provider side effects", async () => {
    const before = await fixture.db.select().from(schema.commerceOrders);
    const movements = await fixture.db
      .select()
      .from(schema.commerceStockMovements);
    expect((await gaps.overview(ORG_A, USER_OWNER_A)).missing).toEqual([
      "SHOP-101",
    ]);
    await gaps.annotate(ORG_A, USER_OWNER_A, "SHOP-101", true);
    await gaps.annotate(ORG_A, USER_OWNER_A, "SHOP-101", true);
    const marked = await gaps.overview(ORG_A, USER_OWNER_A);
    expect(marked.missing).toEqual([]);
    expect(marked.marked.map((row) => row.orderNumber)).toEqual(["SHOP-101"]);
    expect(marked.upstreamCancelled).toContain("SHOP-103");
    expect((await gaps.overview(ORG_B, USER_OWNER_B)).marked).toEqual([]);
    const audit = await fixture.db.select().from(schema.businessAuditEvents);
    expect(
      audit.filter((row) => row.action === "commerce.order_gap.marked"),
    ).toHaveLength(1);
    await gaps.annotate(ORG_B, USER_OWNER_B, "SHOP-101", false);
    expect((await gaps.overview(ORG_A, USER_OWNER_A)).marked).toHaveLength(1);
    await gaps.annotate(ORG_A, USER_OWNER_A, "SHOP-101", false);
    await gaps.annotate(ORG_A, USER_OWNER_A, "SHOP-101", false);
    expect((await gaps.overview(ORG_A, USER_OWNER_A)).missing).toEqual([
      "SHOP-101",
    ]);
    expect(
      (await fixture.db.select().from(schema.businessAuditEvents)).filter(
        (row) => row.action === "commerce.order_gap.restored",
      ),
    ).toHaveLength(1);
    expect(await fixture.db.select().from(schema.commerceOrders)).toEqual(
      before,
    );
    expect(
      await fixture.db.select().from(schema.commerceStockMovements),
    ).toEqual(movements);
  });
  it("requires manage access and rejects existing orders or stale resolved gaps", async () => {
    await expect(
      gaps.annotate(ORG_A, USER_STAFF_A, "SHOP-101", true),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      gaps.annotate(ORG_A, USER_OWNER_B, "SHOP-101", true),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      gaps.annotate(ORG_A, USER_OWNER_A, "SHOP-100", true),
    ).rejects.toThrow("visible gap");
    await fixture.db
      .insert(schema.commerceOrders)
      .values({
        id: "history_gap_resolved",
        organizationId: ORG_A,
        branchId: `default:${ORG_A}`,
        orderNumber: "SHOP-101",
        externalSource: "shopify",
      });
    await expect(
      gaps.annotate(ORG_A, USER_OWNER_A, "SHOP-101", true),
    ).rejects.toThrow("visible gap");
    expect(
      await fixture.db
        .select()
        .from(schema.commerceOrderGapAnnotations)
        .where(eq(schema.commerceOrderGapAnnotations.organizationId, ORG_A)),
    ).toEqual([]);
  });
});

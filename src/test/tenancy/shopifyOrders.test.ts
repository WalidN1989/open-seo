import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  createTenancyFixture,
  ORG_A,
  ORG_B,
  USER_OWNER_A,
  USER_OWNER_B,
  PRODUCT_A,
} from "./fixture";
import { shopifyOrderSchema } from "@/server/features/commerce/providers/shopifyOrders";
import type * as RepositoryModule from "@/server/features/commerce/repositories/ShopifyOrderRepository";
import type * as OrderModule from "@/server/features/commerce/services/OrderService";
import type * as Schema from "@/db/schema";
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
let fixture: Awaited<ReturnType<typeof createTenancyFixture>>;
let Repo: typeof RepositoryModule.ShopifyOrderRepository;
let Orders: typeof OrderModule.OrderService;
let schema: typeof Schema;
const connection = "shopify_alpha";
function payload(id = 100, updated = "2026-10-04T10:00:00Z", price = "10.00") {
  return shopifyOrderSchema.parse({
    id,
    order_number: id,
    created_at: "2026-10-01T10:00:00+05:30",
    updated_at: updated,
    currency: "LKR",
    phone: "+94771111111",
    email: "customer@example.test",
    financial_status: "paid",
    total_price: price,
    total_discounts: "0.00",
    total_tax: "0.00",
    total_shipping_price_set: { shop_money: { amount: "0.00" } },
    line_items: [
      {
        id: 200 + id,
        variant_id: 123,
        sku: "ALPHA-1",
        title: "Book",
        quantity: 1,
        price,
      },
    ],
  });
}
beforeAll(async () => {
  fixture = await createTenancyFixture();
  const db = fixture.db;
  vi.doMock("@/db", () => ({ db }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: db }));
  vi.doMock("@/db/pg/client", () => ({ pgDb: null }));
  schema = await import("@/db/schema");
  await db.insert(schema.integrationConnections).values({
    id: connection,
    organizationId: ORG_A,
    providerKey: "shopify",
    displayName: "Test shop",
    status: "connected",
  });
  await db
    .update(schema.commerceProducts)
    .set({ externalSource: "shopify", externalId: "123", salePriceMinor: 1000 })
    .where(eq(schema.commerceProducts.id, PRODUCT_A));
  ({ ShopifyOrderRepository: Repo } =
    await import("@/server/features/commerce/repositories/ShopifyOrderRepository"));
  ({ OrderService: Orders } =
    await import("@/server/features/commerce/services/OrderService"));
});
afterAll(() => fixture.client.close());
describe("Shopify mirror database invariants", () => {
  it("starts disabled, imports one normalized order and never moves stock", async () => {
    expect(await Repo.enabledConnection(connection)).toBeNull();
    await Repo.setEnabled(ORG_A, connection, true);
    expect((await Repo.enabledConnection(connection))?.organizationId).toBe(
      ORG_A,
    );
    const before = await fixture.db
      .select()
      .from(schema.commerceStockMovements);
    const id = await Repo.ingest(
      ORG_A,
      connection,
      `default:${ORG_A}`,
      payload(),
    );
    const order = await Orders.getOrder(ORG_A, USER_OWNER_A, id);
    expect(order.order).toMatchObject({
      orderNumber: "SHOP-100",
      approvalStatus: "pending",
      status: "draft",
      totalMinor: 1000,
      paidMinor: 1000,
      customerPhone: "+94771111111",
    });
    expect(order.lines).toHaveLength(1);
    expect(order.lines[0]).toMatchObject({
      productId: PRODUCT_A,
      externalVariantId: "123",
    });
    expect(
      await fixture.db.select().from(schema.commerceStockMovements),
    ).toEqual(before);
  });
  it("deduplicates concurrent snapshots and ignores stale baskets and shipments", async () => {
    const current = payload(101, "2026-10-04T12:00:00Z", "20.00");
    const ids = await Promise.all([
      Repo.ingest(ORG_A, connection, `default:${ORG_A}`, current),
      Repo.ingest(ORG_A, connection, `default:${ORG_A}`, current),
    ]);
    const old = payload(101, "2026-10-04T11:00:00Z", "10.00");
    old.fulfillments = [
      {
        id: "1",
        status: "success",
        tracking_company: "Old",
        tracking_numbers: ["OLD-TRACK"],
      },
    ];
    await Repo.ingest(ORG_A, connection, `default:${ORG_A}`, old);
    expect(ids[0]).toBe(ids[1]);
    const order = await Orders.getOrder(ORG_A, USER_OWNER_A, ids[0]);
    expect(order.order.totalMinor).toBe(2000);
    expect(order.lines).toHaveLength(1);
    expect(order.lines[0]?.unitPriceMinor).toBe(2000);
    expect(order.shipments).toHaveLength(0);
  });
  it("requires price acknowledgement, keeps catalogue prices and preserves approval on status-only updates", async () => {
    const orderPayload = payload(102, "2026-10-04T12:00:00Z", "20.00");
    const id = await Repo.ingest(
      ORG_A,
      connection,
      `default:${ORG_A}`,
      orderPayload,
    );
    const detail = await Orders.getOrder(ORG_A, USER_OWNER_A, id);
    const input = {
      orderId: id,
      revision: detail.order.externalUpdatedAt!,
      acknowledgeAdjustments: false,
      lines: [
        {
          lineId: detail.lines[0].id,
          productId: PRODUCT_A,
          acknowledgePrice: false,
        },
      ],
    };
    await expect(
      Orders.approveImportedOrder(ORG_A, USER_OWNER_A, input),
    ).rejects.toThrow("Acknowledge");
    input.lines[0].acknowledgePrice = true;
    await Orders.approveImportedOrder(ORG_A, USER_OWNER_A, input);
    const refreshed = {
      ...orderPayload,
      updated_at: "2026-10-04T13:00:00Z",
      fulfillment_status: "fulfilled",
    };
    await Repo.ingest(ORG_A, connection, `default:${ORG_A}`, refreshed);
    const result = await Orders.getOrder(ORG_A, USER_OWNER_A, id);
    expect(result.order.approvalStatus).toBe("approved");
    expect(result.lines[0].priceReviewedAt).toBeTruthy();
    expect(
      (
        await fixture.db
          .select()
          .from(schema.commerceProducts)
          .where(eq(schema.commerceProducts.id, PRODUCT_A))
      )[0]?.salePriceMinor,
    ).toBe(1000);
    await Repo.ingest(
      ORG_A,
      connection,
      `default:${ORG_A}`,
      payload(102, "2026-10-04T14:00:00Z", "30.00"),
    );
    expect(
      (await Orders.getOrder(ORG_A, USER_OWNER_A, id)).order.approvalStatus,
    ).toBe("pending");
    await expect(
      Orders.approveImportedOrder(ORG_A, USER_OWNER_A, input),
    ).rejects.toThrow("changed");
  });
  it("refuses cross-tenant reads, review mapping and sender-mismatched WhatsApp lookup", async () => {
    const id = await Repo.ingest(
      ORG_A,
      connection,
      `default:${ORG_A}`,
      payload(103),
    );
    await expect(Orders.getOrder(ORG_B, USER_OWNER_B, id)).rejects.toThrow(
      "NOT_FOUND",
    );
    const detail = await Orders.getOrder(ORG_A, USER_OWNER_A, id);
    await expect(
      Orders.approveImportedOrder(ORG_A, USER_OWNER_A, {
        orderId: id,
        revision: detail.order.externalUpdatedAt!,
        acknowledgeAdjustments: false,
        lines: [
          {
            lineId: detail.lines[0].id,
            productId: "product_b",
            acknowledgePrice: true,
          },
        ],
      }),
    ).rejects.toThrow("NOT_FOUND");
    expect(
      JSON.parse(
        await Orders.lookupCustomerOrder(ORG_A, "+94772222222", "SHOP-103"),
      ),
    ).toMatchObject({ found: false });
    expect(
      JSON.parse(
        await Orders.lookupCustomerOrder(ORG_B, "+94771111111", "SHOP-103"),
      ),
    ).toMatchObject({ found: false });
    expect(
      JSON.parse(
        await Orders.lookupCustomerOrder(
          ORG_A,
          "whatsapp:+94771111111",
          "SHOP-103",
        ),
      ),
    ).toMatchObject({
      found: true,
      orderId: "SHOP-103",
      paymentStatus: "paid",
    });
    await expect(Orders.confirmOrder(ORG_A, USER_OWNER_A, id)).rejects.toThrow(
      "mirrored",
    );
    await expect(Orders.cancelOrder(ORG_A, USER_OWNER_A, id)).rejects.toThrow(
      "Shopify or Zoho",
    );
  });
  it("reflects cancellations without a local inventory refund", async () => {
    const old = payload(104);
    const id = await Repo.ingest(ORG_A, connection, `default:${ORG_A}`, old);
    await Repo.ingest(ORG_A, connection, `default:${ORG_A}`, {
      ...old,
      updated_at: "2026-10-04T20:00:00Z",
      cancelled_at: "2026-10-04T20:00:00Z",
    });
    expect(
      (await Orders.getOrder(ORG_A, USER_OWNER_A, id)).order,
    ).toMatchObject({ status: "cancelled", approvalStatus: "rejected" });
    const rows = await fixture.db
      .select()
      .from(schema.commerceStockMovements)
      .where(
        and(
          eq(schema.commerceStockMovements.organizationId, ORG_A),
          eq(schema.commerceStockMovements.referenceId, id),
        ),
      );
    expect(rows).toHaveLength(0);
  });
  it("keeps mirror stock controls blocked after a connection is deleted", async () => {
    const id = await Repo.ingest(
      ORG_A,
      connection,
      `default:${ORG_A}`,
      payload(109),
    );
    await fixture.db
      .delete(schema.integrationConnections)
      .where(eq(schema.integrationConnections.id, connection));
    await expect(Orders.confirmOrder(ORG_A, USER_OWNER_A, id)).rejects.toThrow(
      "mirrored",
    );
    await expect(Orders.cancelOrder(ORG_A, USER_OWNER_A, id)).rejects.toThrow(
      "Shopify or Zoho",
    );
  });
});

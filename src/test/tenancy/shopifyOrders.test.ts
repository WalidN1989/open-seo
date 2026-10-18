import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  createTenancyFixture,
  ORG_A,
  ORG_B,
  USER_OWNER_A,
  USER_OWNER_B,
  PRODUCT_A,
  CONTACT_A,
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
  const { BusinessSettingsRepository } =
    await import("@/server/features/business-modules/repositories/BusinessSettingsRepository");
  await BusinessSettingsRepository.setCurrency(ORG_A, "LKR");
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
  it("preserves reviewed product mapping when a line has no Shopify variant", async () => {
    const first = payload(909);
    first.line_items[0].variant_id = null;
    first.line_items[0].sku = null;
    const id = await Repo.ingest(ORG_A, connection, `default:${ORG_A}`, first);
    const detail = await Orders.getOrder(ORG_A, USER_OWNER_A, id);
    await fixture.db
      .update(schema.commerceOrderLines)
      .set({ productId: PRODUCT_A })
      .where(eq(schema.commerceOrderLines.id, detail.lines[0].id));
    await Repo.ingest(ORG_A, connection, `default:${ORG_A}`, {
      ...first,
      updated_at: "2026-10-05T10:00:00Z",
    });
    expect(
      (await Orders.getOrder(ORG_A, USER_OWNER_A, id)).lines[0].productId,
    ).toBe(PRODUCT_A);
  });
  it("reverses a fully refunded award without changing an issued invoice into debt", async () => {
    const data = payload(902);
    const id = await Repo.ingest(ORG_A, connection, `default:${ORG_A}`, data);
    await fixture.db
      .update(schema.commerceOrders)
      .set({
        approvalStatus: "approved",
        status: "confirmed",
        contactId: CONTACT_A,
      })
      .where(eq(schema.commerceOrders.id, id));
    const order = (await Orders.getOrder(ORG_A, USER_OWNER_A, id)).order;
    const { InvoiceRepository } =
      await import("@/server/features/invoicing/repositories/InvoiceRepository");
    const { OrderLoyaltyRepository } =
      await import("@/server/features/commerce/repositories/OrderLoyaltyRepository");
    await OrderLoyaltyRepository.award(ORG_A, order, 100);
    const invoiceId = await InvoiceRepository.issueInvoice(order, [], "{}");
    const partial = {
      ...data,
      updated_at: "2026-10-05T10:00:00Z",
      financial_status: "partially_refunded",
      total_outstanding: 1000,
    };
    await Repo.ingest(ORG_A, connection, `default:${ORG_A}`, partial);
    expect(await InvoiceRepository.getInvoice(ORG_A, invoiceId)).toMatchObject({
      status: "paid",
      paidMinor: 1000,
    });
    const refunded = {
      ...partial,
      updated_at: "2026-10-06T10:00:00Z",
      financial_status: "refunded",
    };
    await Repo.ingest(ORG_A, connection, `default:${ORG_A}`, refunded);
    await Repo.ingest(ORG_A, connection, `default:${ORG_A}`, refunded);
    await OrderLoyaltyRepository.award(ORG_A, order, 100);
    expect(await OrderLoyaltyRepository.loyalty(ORG_A, CONTACT_A)).toBe(0);
    expect(await InvoiceRepository.getInvoice(ORG_A, invoiceId)).toMatchObject({
      status: "paid",
      paidMinor: 1000,
    });
  });
  it("syncs invoice payments atomically and reverses earnings once after cancellation", async () => {
    const data = {
      ...payload(901),
      financial_status: "pending",
      total_outstanding: 1000,
    };
    const id = await Repo.ingest(ORG_A, connection, `default:${ORG_A}`, data);
    const { InvoiceRepository } =
      await import("@/server/features/invoicing/repositories/InvoiceRepository");
    const { OrderLoyaltyRepository } =
      await import("@/server/features/commerce/repositories/OrderLoyaltyRepository");
    await fixture.db
      .update(schema.commerceOrders)
      .set({
        approvalStatus: "approved",
        status: "confirmed",
        contactId: CONTACT_A,
      })
      .where(eq(schema.commerceOrders.id, id));
    const order = (await Orders.getOrder(ORG_A, USER_OWNER_A, id)).order;
    const invoiceId = await InvoiceRepository.issueInvoice(order, [], "{}");
    await OrderLoyaltyRepository.award(ORG_A, order, 100);
    const paid = {
      ...data,
      updated_at: "2026-10-05T10:00:00Z",
      financial_status: "paid",
      total_outstanding: 0,
    };
    await Repo.ingest(ORG_A, connection, `default:${ORG_A}`, paid);
    expect(await InvoiceRepository.getInvoice(ORG_A, invoiceId)).toMatchObject({
      status: "paid",
      paidMinor: 1000,
    });
    // Stale payments cannot overwrite the accepted newer paid snapshot.
    await Repo.ingest(ORG_A, connection, `default:${ORG_A}`, data);
    expect(
      (await InvoiceRepository.getInvoice(ORG_A, invoiceId))?.paidMinor,
    ).toBe(1000);
    const cancelled = {
      ...paid,
      updated_at: "2026-10-06T10:00:00Z",
      cancelled_at: "2026-10-06T10:00:00Z",
    };
    await Promise.all([
      Repo.ingest(ORG_A, connection, `default:${ORG_A}`, cancelled),
      Repo.ingest(ORG_A, connection, `default:${ORG_A}`, cancelled),
    ]);
    expect(await OrderLoyaltyRepository.loyalty(ORG_A, CONTACT_A)).toBe(0);
    await OrderLoyaltyRepository.award(ORG_A, order, 100);
    expect(await OrderLoyaltyRepository.loyalty(ORG_A, CONTACT_A)).toBe(0);
    expect(await InvoiceRepository.getInvoice(ORG_B, invoiceId)).toBeNull();
  });
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

import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  createTenancyFixture,
  ORG_A,
  USER_OWNER_A,
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
describe("strict catalogue price review", () => {
  it("requires catalogue correction even with an acknowledgement and preserves source prices on approval", async () => {
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
    ).rejects.toThrow("Correct each catalogue price");
    input.lines[0].acknowledgePrice = true;
    await expect(
      Orders.approveImportedOrder(ORG_A, USER_OWNER_A, input),
    ).rejects.toThrow("Correct each catalogue price");
    const { CommerceService } =
      await import("@/server/features/commerce/services/CommerceService");
    await CommerceService.updateProduct(ORG_A, USER_OWNER_A, {
      id: PRODUCT_A,
      salePriceMinor: 2000,
    });
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
    ).toBe(2000);
    expect(result.order.totalMinor).toBe(2000);
    expect(result.lines[0].unitPriceMinor).toBe(2000);
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
  it("checks the catalogue again in the approval write after a concurrent price change", async () => {
    const { OrderRepository } =
      await import("@/server/features/commerce/repositories/OrderRepository");
    const { CommerceRepository } =
      await import("@/server/features/commerce/repositories/CommerceRepository");
    const { OrderOperationsService } =
      await import("@/server/features/commerce/services/OrderOperationsService");
    await CommerceRepository.updateProduct(ORG_A, {
      id: PRODUCT_A,
      salePriceMinor: 1000,
    });
    const id = await Repo.ingest(
      ORG_A,
      connection,
      `default:${ORG_A}`,
      payload(104),
    );
    const detail = await Orders.getOrder(ORG_A, USER_OWNER_A, id);
    const original = OrderRepository.approveImport;
    const enqueue = vi.spyOn(OrderOperationsService, "enqueueApproved");
    const review = vi
      .spyOn(OrderRepository, "approveImport")
      .mockImplementationOnce(async (...args) => {
        await CommerceRepository.updateProduct(ORG_A, {
          id: PRODUCT_A,
          salePriceMinor: 5000,
        });
        return original(...args);
      });
    try {
      await expect(
        Orders.approveImportedOrder(ORG_A, USER_OWNER_A, {
          orderId: id,
          revision: detail.order.externalUpdatedAt!,
          acknowledgeAdjustments: false,
          lines: [{ lineId: detail.lines[0].id, productId: PRODUCT_A }],
        }),
      ).rejects.toThrow("changed");
      const after = await Orders.getOrder(ORG_A, USER_OWNER_A, id);
      expect(after.order).toMatchObject({
        status: "draft",
        approvalStatus: "pending",
        totalMinor: 1000,
      });
      expect(after.lines[0].unitPriceMinor).toBe(1000);
      expect(after.shipments).toHaveLength(0);
      expect(enqueue).not.toHaveBeenCalled();
    } finally {
      review.mockRestore();
      enqueue.mockRestore();
      await CommerceRepository.updateProduct(ORG_A, {
        id: PRODUCT_A,
        salePriceMinor: 1000,
      });
    }
  });
  it("keeps delivery separate from the matched item price and preserves Shopify totals", async () => {
    const { CommerceService } =
      await import("@/server/features/commerce/services/CommerceService");
    const data = payload(105, "2026-10-04T12:00:00Z", "32.00");
    data.total_price = 3550;
    data.total_shipping_price_set.shop_money.amount = 350;
    const id = await Repo.ingest(ORG_A, connection, `default:${ORG_A}`, data);
    const detail = await Orders.getOrder(ORG_A, USER_OWNER_A, id);
    await CommerceService.updateProduct(ORG_A, USER_OWNER_A, {
      id: PRODUCT_A,
      salePriceMinor: 3200,
    });
    try {
      await Orders.approveImportedOrder(ORG_A, USER_OWNER_A, {
        orderId: id,
        revision: detail.order.externalUpdatedAt!,
        acknowledgeAdjustments: false,
        lines: [{ lineId: detail.lines[0].id, productId: PRODUCT_A }],
      });
      const after = await Orders.getOrder(ORG_A, USER_OWNER_A, id);
      expect(after.order).toMatchObject({
        approvalStatus: "approved",
        subtotalMinor: 3200,
        deliveryMinor: 350,
        totalMinor: 3550,
      });
      expect(after.lines[0]).toMatchObject({
        unitPriceMinor: 3200,
        quantity: 1,
        lineTotalMinor: 3200,
      });
    } finally {
      await CommerceService.updateProduct(ORG_A, USER_OWNER_A, {
        id: PRODUCT_A,
        salePriceMinor: 1000,
      });
    }
  });
  it("blocks currency differences and archived products even when an old client acknowledges them", async () => {
    const { CommerceRepository } =
      await import("@/server/features/commerce/repositories/CommerceRepository");
    const data = payload(106);
    data.currency = "AUD";
    const id = await Repo.ingest(ORG_A, connection, `default:${ORG_A}`, data);
    const detail = await Orders.getOrder(ORG_A, USER_OWNER_A, id);
    const input = {
      orderId: id,
      revision: detail.order.externalUpdatedAt!,
      acknowledgeAdjustments: false,
      lines: [
        {
          lineId: detail.lines[0].id,
          productId: PRODUCT_A,
          acknowledgePrice: true,
        },
      ],
    };
    await expect(
      Orders.approveImportedOrder(ORG_A, USER_OWNER_A, input),
    ).rejects.toThrow("currency");
    await CommerceRepository.updateProduct(ORG_A, {
      id: PRODUCT_A,
      status: "archived",
    });
    try {
      await expect(
        Orders.approveImportedOrder(ORG_A, USER_OWNER_A, input),
      ).rejects.toThrow("NOT_FOUND");
    } finally {
      await CommerceRepository.updateProduct(ORG_A, {
        id: PRODUCT_A,
        status: "active",
      });
    }
  });
});

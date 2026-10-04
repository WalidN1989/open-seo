import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
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
beforeAll(async () => {
  await Repo.setEnabled(ORG_A, connection, true);
});
afterAll(() => fixture.client.close());
describe("Shopify history, webhook and courier boundaries", () => {
  it("imports legacy history idempotently and replaces its basket with an authoritative Shopify snapshot", async () => {
    const { parseLegacyOrders } =
      await import("@/server/features/commerce/providers/legacyOrders");
    const { LegacyOrderRepository } =
      await import("@/server/features/commerce/repositories/LegacyOrderRepository");
    const ordersCsv =
      "order_number,shopify_order_id,created_at,delivery_status,tracking_number,delivery_tracking_status,customer_name,customer_email,customer_mobile,billing_address,subtotal,grand_total,discount_amount,shipping_amount,currency,is_pickup\nSHOP-105,gid://shopify/Order/105,2026-10-01T10:00:00+05:30,confirmed,DTEST105,NOT DELIVERED,Sample customer,customer@example.test,+94771111111,Sample address,10,10,0,0,LKR,false";
    const linesCsv =
      "order_number,line_item_id,sku,title,quantity,unit_price,line_total,currency\nSHOP-105,legacy-line-105,ALPHA-1,Legacy Book,1,10,10,LKR";
    const [old] = parseLegacyOrders(ordersCsv, linesCsv);
    const before = await fixture.db
      .select()
      .from(schema.commerceStockMovements);
    await LegacyOrderRepository.importOrder(
      ORG_A,
      connection,
      `default:${ORG_A}`,
      old,
    );
    await LegacyOrderRepository.importOrder(
      ORG_A,
      connection,
      `default:${ORG_A}`,
      old,
    );
    const id = `shopify:${connection}:105`;
    const legacy = await Orders.getOrder(ORG_A, USER_OWNER_A, id);
    expect(legacy.lines).toHaveLength(1);
    expect(legacy.shipments).toHaveLength(1);
    expect(legacy.shipments[0]).toMatchObject({
      status: "NOT DELIVERED",
      checkedAt: null,
    });
    await Repo.ingest(ORG_A, connection, `default:${ORG_A}`, payload(105));
    await LegacyOrderRepository.importOrder(
      ORG_A,
      connection,
      `default:${ORG_A}`,
      old,
    );
    const current = await Orders.getOrder(ORG_A, USER_OWNER_A, id);
    expect(current.lines).toHaveLength(1);
    expect(current.lines[0].description).toBe("Book");
    expect(current.order.paymentStatus).toBe("paid");
    expect(current.shipments).toHaveLength(1);
    expect(
      await fixture.db.select().from(schema.commerceStockMovements),
    ).toEqual(before);
    expect(() =>
      parseLegacyOrders(
        ordersCsv.replace("gid://shopify/Order/105", ""),
        linesCsv,
      ),
    ).toThrow("stable Shopify order ID");
    expect(() =>
      parseLegacyOrders(ordersCsv, linesCsv.replace(",1,10,10,", ",2,10,10,")),
    ).toThrow();
  });

  it("authenticates the raw Shopify webhook and rejects disabled connections and wrong stores", async () => {
    const { ShopifyOrderService } =
      await import("@/server/features/commerce/services/ShopifyOrderService");
    vi.stubEnv("TEST_SHOP_SHOP_DOMAIN", "sample.myshopify.com");
    vi.stubEnv("TEST_SHOP_CLIENT_SECRET", "unit-test-signing-secret");
    await fixture.db
      .update(schema.integrationConnections)
      .set({ credentialReference: "TEST_SHOP" })
      .where(eq(schema.integrationConnections.id, connection));
    const body = JSON.stringify({
      id: 106,
      order_number: 106,
      created_at: "2026-10-01T10:00:00Z",
      updated_at: "2026-10-04T10:00:00Z",
      currency: "LKR",
      financial_status: "paid",
      total_price: "10.00",
      total_discounts: "0.00",
      total_tax: "0.00",
      total_shipping_price_set: { shop_money: { amount: "0.00" } },
      line_items: [
        {
          id: 306,
          variant_id: 123,
          sku: "ALPHA-1",
          title: "Book",
          quantity: 1,
          price: "10.00",
        },
      ],
    });
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode("unit-test-signing-secret"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const digest = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(body),
    );
    const headers = new Headers({
      "x-shopify-shop-domain": "sample.myshopify.com",
      "x-shopify-topic": "orders/create",
      "x-shopify-hmac-sha256": btoa(
        String.fromCharCode(...new Uint8Array(digest)),
      ),
    });
    expect(await ShopifyOrderService.webhook(connection, headers, body)).toBe(
      200,
    );
    expect(await ShopifyOrderService.webhook(connection, headers, body)).toBe(
      200,
    );
    expect(
      await ShopifyOrderService.webhook(connection, headers, body + " "),
    ).toBe(401);
    headers.set("x-shopify-shop-domain", "other.myshopify.com");
    expect(await ShopifyOrderService.webhook(connection, headers, body)).toBe(
      401,
    );
    await Repo.setEnabled(ORG_A, connection, false);
    expect(await ShopifyOrderService.webhook(connection, headers, body)).toBe(
      404,
    );
    await Repo.setEnabled(ORG_A, connection, true);
    vi.unstubAllEnvs();
  });
  it("rejects only the local review and keeps the upstream order and inventory intact", async () => {
    const id = await Repo.ingest(
      ORG_A,
      connection,
      `default:${ORG_A}`,
      payload(107),
    );
    const before = await Orders.getOrder(ORG_A, USER_OWNER_A, id);
    await expect(
      Orders.rejectImportedOrder(
        ORG_B,
        USER_OWNER_B,
        id,
        before.order.externalUpdatedAt!,
      ),
    ).rejects.toThrow("NOT_FOUND");
    await Orders.rejectImportedOrder(
      ORG_A,
      USER_OWNER_A,
      id,
      before.order.externalUpdatedAt!,
    );
    const after = await Orders.getOrder(ORG_A, USER_OWNER_A, id);
    expect(after.order).toMatchObject({
      status: "draft",
      approvalStatus: "rejected",
      paymentStatus: "paid",
    });
    expect(after.lines).toEqual(before.lines);
    await expect(
      Orders.rejectImportedOrder(
        ORG_A,
        USER_OWNER_A,
        id,
        before.order.externalUpdatedAt!,
      ),
    ).rejects.toThrow("changed");
    expect(
      await fixture.db
        .select()
        .from(schema.commerceStockMovements)
        .where(eq(schema.commerceStockMovements.referenceId, id)),
    ).toHaveLength(0);
  });
  it("uses read-only Citypak tracking, preserves failure state and never mistakes NOT DELIVERED for DELIVERED", async () => {
    const { OrderShipmentService } =
      await import("@/server/features/commerce/services/OrderShipmentService");
    vi.stubEnv(
      "BETTER_AUTH_SECRET",
      "unit-test-only-encryption-key-32-characters",
    );
    const id = await Repo.ingest(
      ORG_A,
      connection,
      `default:${ORG_A}`,
      payload(108),
    );
    await OrderShipmentService.configure(
      ORG_A,
      USER_OWNER_A,
      connection,
      "unit-test-citypak-key",
    );
    await OrderShipmentService.link(ORG_A, USER_OWNER_A, {
      orderId: id,
      trackingNumber: "DTEST108",
    });
    const before = await Orders.getOrder(ORG_A, USER_OWNER_A, id);
    const shipment = before.shipments[0];
    await expect(
      OrderShipmentService.refresh(ORG_B, USER_OWNER_B, id, shipment.id),
    ).rejects.toThrow("NOT_FOUND");
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe(
        "https://falcon.citypak.lk/customer_api/v1/track?tracking_number=DTEST108",
      );
      expect(init.method ?? "GET").toBe("GET");
      expect(init.redirect).toBe("manual");
      return Response.json({
        success: true,
        data: {
          is_delivered: false,
          tracking_history: [{ status_type: "NOT DELIVERED" }],
        },
      });
    });
    vi.stubGlobal("fetch", fetcher);
    await OrderShipmentService.refresh(ORG_A, USER_OWNER_A, id, shipment.id);
    const updated = (await Orders.getOrder(ORG_A, USER_OWNER_A, id))
      .shipments[0];
    expect(updated.status).toBe("NOT DELIVERED");
    expect(updated.checkedAt).toBeTruthy();
    vi.stubGlobal("fetch", async () =>
      Response.json({ success: false }, { status: 503 }),
    );
    await expect(
      OrderShipmentService.refresh(ORG_A, USER_OWNER_A, id, shipment.id),
    ).rejects.toThrow("previous status is retained");
    expect(
      (await Orders.getOrder(ORG_A, USER_OWNER_A, id)).shipments[0],
    ).toEqual(updated);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
});

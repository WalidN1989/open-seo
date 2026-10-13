import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTenancyFixture, ORG_A } from "./fixture";
import type * as RepoModule from "@/server/features/commerce/repositories/ShopifyOrderRepository";
import type * as OrderModule from "@/server/features/commerce/repositories/OrderRepository";
import { shopifyOrderSchema } from "@/server/features/commerce/providers/shopifyOrders";
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
let fixture: Awaited<ReturnType<typeof createTenancyFixture>>;
let Repo: typeof RepoModule.ShopifyOrderRepository;
let Orders: typeof OrderModule.OrderRepository;
const connection = "courier-identity-shopify";
beforeAll(async () => {
  fixture = await createTenancyFixture();
  vi.doMock("@/db", () => ({ db: fixture.db }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: fixture.db }));
  vi.doMock("@/db/pg/client", () => ({ pgDb: null }));
  const schema = await import("@/db/schema");
  await fixture.db.insert(schema.integrationConnections).values({
    id: connection,
    organizationId: ORG_A,
    providerKey: "shopify",
    displayName: "Synthetic",
    status: "connected",
  });
  ({ ShopifyOrderRepository: Repo } =
    await import("@/server/features/commerce/repositories/ShopifyOrderRepository"));
  ({ OrderRepository: Orders } =
    await import("@/server/features/commerce/repositories/OrderRepository"));
});
afterAll(() => fixture.client.close());
function payload(id: number) {
  return shopifyOrderSchema.parse({
    id,
    order_number: id,
    created_at: "2026-10-14T00:00:00Z",
    updated_at: "2026-10-14T00:00:00Z",
    currency: "LKR",
    financial_status: "paid",
    total_price: "10.00",
    total_discounts: "0.00",
    total_tax: "0.00",
    total_shipping_price_set: { shop_money: { amount: "0.00" } },
    line_items: [{ id: 1, title: "Synthetic", quantity: 1, price: "10.00" }],
  });
}

describe("courier identity provenance", () => {
  it("keeps Shopify fulfillment identity separate from courier order identity", async () => {
    const data = payload(990);
    data.fulfillments = [
      {
        id: "99990",
        status: "success",
        tracking_company: "Citypak",
        tracking_numbers: ["D990"],
      },
    ];
    const id = await Repo.ingest(ORG_A, connection, `default:${ORG_A}`, data);
    const [shipment] = await Orders.shipments(ORG_A, id);
    expect(shipment.id).toContain(":fulfillment:99990:");
    expect(shipment.externalId).toBeNull();
    expect(shipment.trackingNumber).toBe("D990");
  });
});

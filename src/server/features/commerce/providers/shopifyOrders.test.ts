import { describe, expect, it } from "vitest";
import {
  orderPhone,
  shopifyOrderSchema,
  shopifyOrderValues,
  verifyShopifySignature,
} from "./shopifyOrders";
describe("Shopify order boundaries", () => {
  it("verifies exact raw bytes and rejects forged or malformed signatures", async () => {
    const body = '{"id":123}';
    const secret = "unit-test-only";
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const digest = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(body),
    );
    const signature = btoa(String.fromCharCode(...new Uint8Array(digest)));
    expect(await verifyShopifySignature(body, signature, secret)).toBe(true);
    expect(await verifyShopifySignature(body + " ", signature, secret)).toBe(
      false,
    );
    expect(await verifyShopifySignature(body, "!", secret)).toBe(false);
    expect(await verifyShopifySignature(body, signature, "other")).toBe(false);
  });
  it("never guesses a national phone number for customer authorization", () => {
    expect(orderPhone("0771234567")).toBeNull();
    expect(orderPhone("+94 (77) 123-4567")).toBe("+94771234567");
  });
});

describe("Shopify payment method", () => {
  const raw = {
    id: 1,
    order_number: 1,
    created_at: "2026-10-14T00:00:00Z",
    updated_at: "2026-10-14T00:00:00Z",
    currency: "LKR",
    financial_status: "paid",
    total_price: "10.00",
    total_discounts: "0.00",
    total_tax: "0.00",
    total_shipping_price_set: { shop_money: { amount: "0.00" } },
    line_items: [{ id: 1, title: "Test", quantity: 1, price: "10.00" }],
  };
  it("preserves the reported gateway without inventing a fee", () => {
    const values = shopifyOrderValues(
      shopifyOrderSchema.parse({ ...raw, payment_gateway_names: ["PayHere"] }),
    );
    expect(values.paymentMethod).toBe("PayHere");
    expect(values.totalMinor).toBe(1000);
    expect(
      shopifyOrderValues(shopifyOrderSchema.parse(raw)).paymentMethod,
    ).toBeNull();
  });
  it.each([
    {
      code: "Pickup From Warehouse (Demetagoda) FREE",
      title: "Pickup From Warehouse (Demetagoda) FREE",
    },
    { code: "custom-collection", title: "  Local pickup  " },
    { code: "pickup", title: "Collect at warehouse" },
    { code: "pick_up", title: "Collect at warehouse" },
  ])(
    "recognizes Shopify pickup shipping methods without requiring a delivery address: $code",
    (shipping) => {
      const order = shopifyOrderValues(
        shopifyOrderSchema.parse({
          ...raw,
          shipping_lines: [shipping],
          shipping_address: null,
        }),
      );
      expect(order.pickup).toBe(true);
      expect(order.shippingAddress).toBeNull();
    },
  );
  it.each([
    "Standard delivery",
    "Delivery (pickup unavailable)",
    "Pickuptruck courier service",
  ])("does not mistake delivery for pickup: %s", (title) => {
    expect(
      shopifyOrderValues(
        shopifyOrderSchema.parse({
          ...raw,
          shipping_lines: [{ code: "delivery", title }],
        }),
      ).pickup,
    ).toBe(false);
  });
});

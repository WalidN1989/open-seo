import { describe, expect, it } from "vitest";
import { wooOrderSchema, wooOrderSnapshot } from "./woocommerceOrders";

const raw = {
  id: 42,
  number: "1042",
  date_created_gmt: "2026-10-21T12:00:00",
  date_modified_gmt: "2026-10-21T12:00:00",
  status: "processing",
  currency: "LKR",
  total: "5070.00",
  discount_total: "0.00",
  shipping_total: "0.00",
  total_tax: "0.00",
  billing: {
    first_name: "Alex",
    phone: "075 141 0227",
    country: "LK",
    email: "alex@example.test",
  },
  shipping: { address_1: "Test road", city: "Colombo" },
  payment_method: "cod",
  date_paid_gmt: null,
  line_items: [
    {
      id: 7,
      product_id: 346,
      variation_id: 0,
      name: "Period panty &amp; pack",
      sku: "P1",
      quantity: 3,
      subtotal: "5070.00",
      total: "5070.00",
    },
  ],
};
describe("WooCommerce order boundary", () => {
  it("preserves Woo totals, quantities, UTC dates and billing contact", () => {
    const snapshot = wooOrderSnapshot(wooOrderSchema.parse(raw));
    expect(snapshot.values).toMatchObject({
      orderNumber: "WOO-1042",
      totalMinor: 507000,
      customerPhone: "+94751410227",
      createdAt: "2026-10-21T12:00:00.000Z",
      paymentStatus: "unpaid",
    });
    expect(snapshot.lines[0]).toMatchObject({
      quantity: 3,
      unitPriceMinor: 169000,
      lineTotalMinor: 507000,
      description: "Period panty & pack",
    });
  });
  it("only normalizes national phones when the billing country is explicit", () => {
    expect(
      wooOrderSnapshot(
        wooOrderSchema.parse({
          ...raw,
          billing: { ...raw.billing, country: "" },
        }),
      ).values.customerPhone,
    ).toBeNull();
    expect(
      wooOrderSnapshot(
        wooOrderSchema.parse({
          ...raw,
          billing: { ...raw.billing, phone: "+44 7700 900123", country: "GB" },
        }),
      ).values.customerPhone,
    ).toBe("+447700900123");
  });
  it("preserves refund and cancellation states and flags fees for review", () => {
    const order = wooOrderSchema.parse({
      ...raw,
      status: "refunded",
      date_paid_gmt: "2026-10-21T12:00:00",
      fee_lines: [{ total: "20.00" }],
    });
    expect(wooOrderSnapshot(order)).toMatchObject({
      hasRefund: true,
      values: { status: "cancelled", paymentStatus: "refunded", paidMinor: 0 },
    });
    expect(wooOrderSnapshot(order).values.note).toContain("review");
  });
  it("rejects malformed/overflowing money, unsupported currencies, duplicates and local dates", () => {
    for (const patch of [
      { total: "NaN" },
      { total: "21474836.48" },
      { total: "1.001" },
      { currency: "JPY" },
      { date_modified_gmt: "not a date" },
      { date_paid_gmt: "not a date" },
      { line_items: [raw.line_items[0], raw.line_items[0]] },
    ])
      expect(wooOrderSchema.safeParse({ ...raw, ...patch }).success).toBe(
        false,
      );
  });
});

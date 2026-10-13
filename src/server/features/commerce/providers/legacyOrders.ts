import Papa from "papaparse";
import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import { orderPhone } from "./shopifyOrders";

const amount = z
  .string()
  .regex(/^\d+(?:\.\d{1,2})?$/)
  .transform((value) => Math.round(Number(value) * 100))
  .pipe(z.number().int().max(2_147_483_647));
const charge = z
  .string()
  .transform((value) => value || "0")
  .pipe(amount);
const date = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());
const orderSchema = z.object({
  order_number: z.string().min(1).max(80),
  shopify_order_id: z.string().optional(),
  created_at: date,
  delivery_status: z.string(),
  tracking_number: z.string().max(80).optional(),
  delivery_tracking_status: z.string().max(120).optional(),
  customer_name: z.string().max(300),
  customer_email: z.string().max(320),
  customer_mobile: z.string().max(80),
  billing_address: z.string().max(2000),
  subtotal: amount,
  grand_total: amount,
  discount_amount: charge,
  shipping_amount: charge,
  currency: z.literal("LKR"),
  is_pickup: z.string().optional(),
});
const lineSchema = z.object({
  order_number: z.string().min(1),
  line_item_id: z.string().min(1).max(100),
  sku: z.string().max(100),
  title: z.string().min(1).max(1000),
  quantity: z.coerce.number().int().min(1).max(1_000_000),
  unit_price: amount,
  line_total: amount,
  currency: z.literal("LKR"),
});
function csvRows(csv: string) {
  const parsed = Papa.parse<unknown>(csv, {
    header: true,
    skipEmptyLines: "greedy",
  });
  if (parsed.errors.length || parsed.data.length > 25_000)
    throw new AppError("VALIDATION_ERROR");
  return parsed.data;
}
export function parseLegacyOrders(ordersCsv: string, linesCsv: string) {
  const orders = z.array(orderSchema).parse(csvRows(ordersCsv));
  const items = z.array(lineSchema).parse(csvRows(linesCsv));
  if (
    new Set(orders.map((order) => order.order_number)).size !== orders.length ||
    new Set(items.map((line) => line.line_item_id)).size !== items.length
  )
    throw new AppError("VALIDATION_ERROR");
  const orderNames = new Set(orders.map((order) => order.order_number));
  if (items.some((line) => !orderNames.has(line.order_number)))
    throw new AppError("VALIDATION_ERROR");
  return orders.map((order) => {
    const lines = items.filter(
      (line) => line.order_number === order.order_number,
    );
    if (
      !lines.length ||
      lines.length > 200 ||
      lines.some((line) => line.line_total !== line.quantity * line.unit_price)
    )
      throw new AppError("VALIDATION_ERROR");
    const shopifyId = order.shopify_order_id?.match(
      /^(?:gid:\/\/shopify\/Order\/)?(\d+)$/,
    )?.[1];
    if (order.order_number.startsWith("SHOP-") && !shopifyId)
      throw new AppError(
        "CONFLICT",
        "A Shopify history row lacks its stable Shopify order ID. Import Shopify history first or correct the export.",
      );
    return {
      orderNumber: order.order_number,
      shopifyId: shopifyId ?? null,
      createdAt: order.created_at,
      customerName: order.customer_name,
      customerEmail: order.customer_email || null,
      customerPhone: orderPhone(order.customer_mobile),
      shippingAddress: order.billing_address,
      subtotalMinor: order.subtotal,
      totalMinor: order.grand_total,
      discountMinor: order.discount_amount,
      deliveryMinor: order.shipping_amount,
      pickup: order.is_pickup === "true",
      pending: order.delivery_status === "draft_pending_approval",
      cancelled: ["cancelled", "canceled", "rejected"].includes(
        order.delivery_status,
      ),
      trackingNumber: order.tracking_number || null,
      trackingStatus: order.delivery_tracking_status || "UNKNOWN",
      lines,
    };
  });
}

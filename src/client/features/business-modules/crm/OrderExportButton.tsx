import { useMutation } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { getOrderWorkspace } from "@/serverFunctions/orderWorkspace";
import { buildCsv, downloadCsv, type CsvValue } from "@/client/lib/csv";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
export function OrderExportButton({
  search,
  tab,
  lineItems = false,
}: {
  search: string;
  tab: "all" | "pending" | "adjustments";
  lineItems?: boolean;
}) {
  const run = useMutation({
    mutationFn: async () => {
      const rows: CsvValue[][] = [];
      let truncated = false;
      for (let offset = 0; offset < 25_000; offset += 200) {
        const result = await getOrderWorkspace({
          data: { search, tab, limit: 200, offset },
        });
        for (const { order, lines, shipments } of result.rows) {
          if (lineItems) {
            for (const line of lines)
              rows.push([
                order.orderNumber,
                order.externalId,
                line.externalId || line.id,
                line.sku,
                line.description,
                line.quantity,
                line.unitPriceMinor / 100,
                line.lineTotalMinor / 100,
                order.currency,
              ]);
          } else
            rows.push([
              order.orderNumber,
              order.externalId,
              order.createdAt,
              order.status,
              order.approvalStatus,
              order.customerName,
              order.customerEmail,
              order.customerPhone,
              order.shippingAddress,
              order.paymentStatus,
              order.subtotalMinor / 100,
              order.discountMinor / 100,
              order.deliveryMinor / 100,
              order.taxMinor / 100,
              order.totalMinor / 100,
              order.currency,
              order.pickup,
              shipments.map((s) => s.trackingNumber).join("; "),
              shipments.map((s) => s.status).join("; "),
            ]);
        }
        if (offset + result.rows.length >= result.total || !result.rows.length)
          break;
        if (offset + 200 >= 25_000) truncated = true;
      }
      downloadCsv(
        lineItems ? "order-line-items.csv" : "orders.csv",
        buildCsv(
          lineItems
            ? [
                "order_number",
                "external_id",
                "line_item_id",
                "sku",
                "title",
                "quantity",
                "unit_price",
                "line_total",
                "currency",
              ]
            : [
                "order_number",
                "external_id",
                "created_at",
                "status",
                "approval_status",
                "customer_name",
                "customer_email",
                "customer_mobile",
                "shipping_address",
                "payment_status",
                "subtotal",
                "discount_amount",
                "shipping_amount",
                "tax",
                "grand_total",
                "currency",
                "is_pickup",
                "tracking_number",
                "delivery_tracking_status",
              ],
          rows,
        ),
      );
      if (truncated)
        toast.info(
          "Export limited to 25,000 orders. Narrow your search to export the remainder.",
        );
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });
  return (
    <button
      className="btn btn-outline btn-sm"
      disabled={run.isPending}
      onClick={() => run.mutate()}
    >
      <Download className="size-3.5" />
      {run.isPending
        ? "Exporting…"
        : lineItems
          ? "Export Line Items"
          : "Export CSV"}
    </button>
  );
}

import { Fragment, useState, type Dispatch, type SetStateAction } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  FileText,
  Pencil,
  MoreHorizontal,
  RefreshCw,
  Printer,
} from "lucide-react";
import { refreshOrderShipment } from "@/serverFunctions/orders";
import type { getOrderWorkspace } from "@/serverFunctions/orderWorkspace";
import { formatMoney } from "@/shared/currencies";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { OrderRowPanel, type OrderPanelKind } from "./OrderRowPanel";
export function OrdersTable({
  rows,
  organizationId,
  currency,
  openOrderId,
  setOpenOrderId,
}: {
  rows: Awaited<ReturnType<typeof getOrderWorkspace>>["rows"];
  organizationId: string;
  currency: string;
  openOrderId: string | null;
  setOpenOrderId: Dispatch<SetStateAction<string | null>>;
}) {
  const [panel, setPanel] = useState<{
    orderId: string;
    kind: OrderPanelKind;
  } | null>(null);
  const showPanel = (orderId: string, kind: OrderPanelKind) => {
    const currentKind = panel?.orderId === orderId ? panel.kind : "actions";
    setPanel({ orderId, kind });
    setOpenOrderId(
      openOrderId === orderId && currentKind === kind ? null : orderId,
    );
  };
  const client = useQueryClient();
  const refresh = useMutation({
    mutationFn: (data: { orderId: string; shipmentId: string }) =>
      refreshOrderShipment({ data }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["commerce"] }),
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });
  return (
    <div className="overflow-x-auto rounded-lg border border-base-300">
      <table className="table table-sm">
        <thead>
          <tr>
            {[
              "Order number",
              "External ID",
              "Customer",
              "Payment terms",
              "Tracking",
              "Products",
              "Date",
              "Total amount",
              "View invoice",
              "Edit order",
              "Actions",
            ].map((label) => (
              <th
                key={label}
                className={label === "Total amount" ? "text-right" : undefined}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ order, lines, shipments }) => (
            <Fragment key={order.id}>
              <tr
                className={
                  order.approvalStatus === "pending"
                    ? "bg-warning/5"
                    : undefined
                }
              >
                <td className="whitespace-nowrap">
                  <button
                    className="font-medium text-primary"
                    onClick={() => showPanel(order.id, "actions")}
                  >
                    {order.orderNumber}
                  </button>
                  <p className="mt-1">
                    <OrderStatus order={order} />
                  </p>
                </td>
                <td className="font-mono text-xs">
                  {order.externalId?.split(":").at(-1) || "—"}
                </td>
                <td className="min-w-36">
                  {order.customerName || "—"}
                  <p className="text-xs text-base-content/60">
                    {order.customerPhone}
                  </p>
                </td>
                <td>
                  <span
                    className={`badge badge-sm ${order.paymentStatus === "paid" ? "badge-success" : order.paymentStatus === "refunded" ? "badge-warning" : "badge-ghost"}`}
                  >
                    {order.paymentTerms || "Not recorded"}
                  </span>
                  <p className="mt-1 text-xs text-base-content/60">
                    {order.paymentMethod
                      ? `${({ koko: "KOKO", mint_pay: "Mint Pay", payhere: "Payhere", cash: "Cash", combank: "COMBANK", daraz: "Daraz", kapruka: "Kapruka" } as Record<string, string>)[order.paymentMethod] || order.paymentMethod} · `
                      : ""}
                    {order.paymentStatus}
                  </p>
                </td>
                <td className="min-w-48">
                  {order.pickup ? (
                    <span className="badge badge-ghost badge-sm">Pickup</span>
                  ) : shipments.length ? (
                    shipments.map((shipment) => (
                      <div
                        key={shipment.id}
                        className="mb-1 flex flex-wrap items-center gap-1"
                      >
                        <span className="badge badge-outline badge-sm">
                          {shipment.status}
                        </span>
                        <span className="font-mono text-xs">
                          {shipment.trackingNumber}
                        </span>
                        {shipment.provider === "Citypak" ? (
                          <>
                            <button
                              className="btn btn-ghost btn-xs"
                              aria-label={`Refresh tracking for ${order.orderNumber}`}
                              disabled={refresh.isPending}
                              onClick={() =>
                                refresh.mutate({
                                  orderId: order.id,
                                  shipmentId: shipment.id,
                                })
                              }
                            >
                              <RefreshCw className="size-3.5" />
                            </button>
                            <a
                              className="btn btn-ghost btn-xs"
                              aria-label={`Print waybill for ${order.orderNumber}`}
                              href={`/api/orders/${encodeURIComponent(order.id)}/label?organizationId=${encodeURIComponent(organizationId)}&shipmentId=${encodeURIComponent(shipment.id)}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <Printer className="size-3.5" />
                            </a>
                          </>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <button
                      className="btn btn-outline btn-xs"
                      onClick={() => showPanel(order.id, "actions")}
                    >
                      View fulfillment
                    </button>
                  )}
                </td>
                <td className="min-w-60 max-w-80">
                  {lines.map((line) => (
                    <p key={line.id} className="mb-1 text-xs">
                      {line.description} × {line.quantity}
                    </p>
                  ))}
                </td>
                <td className="whitespace-nowrap text-xs text-base-content/60">
                  {new Date(order.createdAt).toLocaleDateString()}
                  <br />
                  {new Date(order.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                <td className="text-right font-medium">
                  {formatMoney(order.totalMinor, order.currency || currency)}
                </td>
                <td>
                  <button
                    className="btn btn-ghost btn-xs"
                    aria-label={`View invoice for ${order.orderNumber}`}
                    title="Open order bill preview"
                    onClick={() => showPanel(order.id, "invoice")}
                  >
                    <FileText className="size-4" />
                  </button>
                </td>
                <td>
                  <button
                    className="btn btn-ghost btn-xs"
                    aria-label={`Edit order ${order.orderNumber}`}
                    title={
                      order.status !== "draft"
                        ? "Confirmed and completed orders cannot be edited"
                        : order.integrationConnectionId ||
                            ["shopify", "legacy_zoho"].includes(
                              order.externalSource || "",
                            )
                          ? "Review imported product mapping; edit source details in Shopify"
                          : order.paymentStatus !== "unpaid" ||
                              shipments.length > 0
                            ? "Only unpaid native drafts without shipments can be edited"
                            : "Edit this unpaid native draft"
                    }
                    disabled={
                      order.status !== "draft" ||
                      (order.integrationConnectionId ||
                      ["shopify", "legacy_zoho"].includes(
                        order.externalSource || "",
                      )
                        ? order.approvalStatus !== "pending"
                        : shipments.length > 0 ||
                          order.paymentStatus !== "unpaid" ||
                          Boolean(
                            order.approvalStatus &&
                            order.approvalStatus !== "pending",
                          ))
                    }
                    onClick={() => showPanel(order.id, "edit")}
                  >
                    <Pencil className="size-4" />
                  </button>
                </td>
                <td>
                  <button
                    className="btn btn-ghost btn-xs"
                    aria-label={`Actions for ${order.orderNumber}`}
                    aria-expanded={
                      openOrderId === order.id &&
                      (panel?.orderId !== order.id || panel.kind === "actions")
                    }
                    onClick={() => showPanel(order.id, "actions")}
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                </td>
              </tr>
              {openOrderId === order.id ? (
                <tr>
                  <td colSpan={11}>
                    <OrderRowPanel
                      orderId={order.id}
                      status={order.status}
                      kind={
                        panel?.orderId === order.id ? panel.kind : "actions"
                      }
                      onEdited={() => {
                        setPanel({ orderId: order.id, kind: "actions" });
                        setOpenOrderId(order.id);
                      }}
                    />
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))}
          {!rows.length ? (
            <tr>
              <td
                colSpan={11}
                className="py-10 text-center text-base-content/60"
              >
                No orders match this view.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
function OrderStatus({
  order,
}: {
  order: Awaited<ReturnType<typeof getOrderWorkspace>>["rows"][number]["order"];
}) {
  const label =
    order.approvalStatus === "pending"
      ? "Pending approval"
      : order.approvalStatus === "rejected" && order.status === "draft"
        ? "Review rejected"
        : order.status;
  return (
    <span
      className={`badge badge-sm ${label === "confirmed" ? "badge-success" : label === "Pending approval" || label === "Review rejected" ? "badge-warning" : "badge-ghost"}`}
    >
      {label}
    </span>
  );
}

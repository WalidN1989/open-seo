import { useState, type Dispatch, type SetStateAction } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Info, MoreHorizontal, RefreshCw, Printer } from "lucide-react";
import { refreshOrderShipment } from "@/serverFunctions/orders";
import type { getOrderWorkspace } from "@/serverFunctions/orderWorkspace";
import { formatMoney } from "@/shared/currencies";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { OrderDialog, type OrderDialogTab } from "./OrderDialog";
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
  const [dialogTab, setDialogTab] = useState<OrderDialogTab>("details");
  const showOrder = (orderId: string, tab: OrderDialogTab = "details") => {
    setDialogTab(tab);
    setOpenOrderId(orderId);
  };
  const client = useQueryClient();
  const refresh = useMutation({
    mutationFn: (data: { orderId: string; shipmentId: string }) =>
      refreshOrderShipment({ data }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["commerce"] }),
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });
  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-base-300">
        <table className="table table-sm">
          <thead>
            <tr>
              {[
                "Order number",
                "External ID",
                "Customer",
                "Payment",
                "Tracking",
                "Products",
                "Date",
                "Total amount",
                "Actions",
              ].map((label) => (
                <th
                  key={label}
                  className={
                    label === "Total amount" ? "text-right" : undefined
                  }
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ order, lines, shipments }) => (
              <tr
                key={order.id}
                className={
                  order.approvalStatus === "pending"
                    ? "bg-warning/5"
                    : undefined
                }
              >
                <td className="whitespace-nowrap">
                  <button
                    className="font-medium text-primary"
                    onClick={() => showOrder(order.id)}
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
                    className={`badge badge-sm capitalize ${order.paymentStatus === "paid" ? "badge-success" : order.paymentStatus === "refunded" ? "badge-warning" : "badge-ghost"}`}
                  >
                    {order.paymentStatus.replaceAll("_", " ")}
                  </span>
                  <p className="mt-1 text-xs text-base-content/60">
                    {order.paymentMethod
                      ? (
                          {
                            koko: "KOKO",
                            mint_pay: "Mint Pay",
                            payhere: "Payhere",
                            cash: "Cash",
                            combank: "COMBANK",
                            daraz: "Daraz",
                            kapruka: "Kapruka",
                          } as Record<string, string>
                        )[order.paymentMethod] || order.paymentMethod
                      : ""}
                  </p>
                  {order.paymentTerms ? (
                    <p className="mt-1 text-xs text-base-content/60">
                      {order.paymentTerms}
                    </p>
                  ) : null}
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
                      onClick={() => showOrder(order.id, "fulfillment")}
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
                  <div className="flex items-center justify-end gap-1">
                    <button
                      className={`btn btn-sm gap-1.5 ${order.approvalStatus === "pending" && order.status === "draft" ? "btn-primary" : "btn-ghost"}`}
                      aria-label={`${order.approvalStatus === "pending" && order.status === "draft" ? "Review and approve order" : "View order"} ${order.orderNumber}`}
                      aria-haspopup="dialog"
                      onClick={() => showOrder(order.id)}
                    >
                      <Info className="size-4" aria-hidden="true" />
                      {order.approvalStatus === "pending" &&
                      order.status === "draft"
                        ? "Review & approve"
                        : "View"}
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      aria-label={`Actions for ${order.orderNumber}`}
                      aria-haspopup="dialog"
                      onClick={() => showOrder(order.id, "activity")}
                    >
                      <MoreHorizontal className="size-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td
                  colSpan={9}
                  className="py-10 text-center text-base-content/60"
                >
                  No orders match this view.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {openOrderId ? (
        <OrderDialog
          key={openOrderId}
          orderId={openOrderId}
          initialTab={dialogTab}
          onClose={() => setOpenOrderId(null)}
        />
      ) : null}
    </>
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

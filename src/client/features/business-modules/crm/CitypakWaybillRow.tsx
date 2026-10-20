import { Printer, RefreshCw } from "lucide-react";
import type { getCitypakDashboard } from "@/serverFunctions/orders";
import { formatMoney } from "@/shared/currencies";

type Row = Awaited<ReturnType<typeof getCitypakDashboard>>["rows"][number];
function timestamp(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}
function statusClass(status: string) {
  if (status === "DELIVERED") return "badge-success";
  if (["RETURNED", "RTM", "NOT DELIVERED"].includes(status))
    return "badge-error";
  if (["PENDING", "UNKNOWN"].includes(status)) return "badge-ghost";
  return "badge-info";
}
export function CitypakWaybillRow({
  row: { shipment, order },
  organizationId,
  refreshing,
  refreshDisabled,
  onRefresh,
}: {
  row: Row;
  organizationId: string;
  refreshing: boolean;
  refreshDisabled: boolean;
  onRefresh: () => void;
}) {
  const label = `/api/orders/${encodeURIComponent(order.id)}/label?organizationId=${encodeURIComponent(organizationId)}&shipmentId=${encodeURIComponent(shipment.id)}`;
  return (
    <tr className="hover:bg-base-200/40">
      <td className="font-medium whitespace-nowrap">{order.orderNumber}</td>
      <td>
        <p>{order.customerName || "Customer"}</p>
        <p className="mt-1 text-xs text-base-content/60">
          {order.customerPhone}
        </p>
      </td>
      <td className="whitespace-nowrap font-mono text-xs">
        {shipment.trackingNumber}
      </td>
      <td>
        <span
          className={`badge badge-sm badge-outline ${order.paymentStatus === "paid" ? "badge-success" : "badge-warning"}`}
        >
          {order.paymentStatus}
        </span>
        <p className="mt-1 text-xs text-base-content/60">
          {order.paymentMethod || "No payment method"}
        </p>
      </td>
      <td className="whitespace-nowrap tabular-nums">
        {formatMoney(order.totalMinor, order.currency || "LKR")}
      </td>
      <td>
        <span
          className={`badge badge-sm badge-outline whitespace-nowrap ${statusClass(shipment.status)}`}
        >
          {shipment.status === "UNKNOWN" ? "Awaiting scan" : shipment.status}
        </span>
        <p className="mt-1 max-w-64 text-xs text-base-content/60">
          {shipment.reason}
        </p>
      </td>
      <td className="whitespace-nowrap text-xs">
        <p>Scan: {timestamp(shipment.lastEventAt)}</p>
        <p className="mt-1 text-base-content/60">
          Checked: {timestamp(shipment.checkedAt)}
        </p>
      </td>
      <td>
        <div className="flex items-center gap-1">
          <button
            className="btn btn-ghost btn-sm"
            title="Check Citypak now"
            aria-label={`Refresh tracking ${shipment.trackingNumber}`}
            disabled={refreshDisabled}
            onClick={onRefresh}
          >
            <RefreshCw
              className={`size-4 ${refreshing ? "animate-spin" : ""}`}
            />
            <span className="sr-only">Refresh</span>
          </button>
          <a
            className="btn btn-ghost btn-sm"
            title="Open printable A4 waybill"
            aria-label={`Print A4 label ${shipment.trackingNumber}`}
            target="_blank"
            rel="noreferrer"
            href={label}
          >
            <Printer className="size-4" /> A4
          </a>
          <a
            className="btn btn-ghost btn-sm"
            title="Open printable thermal label"
            aria-label={`Print 4×6 label ${shipment.trackingNumber}`}
            target="_blank"
            rel="noreferrer"
            href={`${label}&size=4X6`}
          >
            4×6
          </a>
        </div>
      </td>
    </tr>
  );
}

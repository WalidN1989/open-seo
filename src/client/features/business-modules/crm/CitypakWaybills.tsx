import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getCitypakDashboard,
  refreshOrderShipment,
} from "@/serverFunctions/orders";
import { formatMoney } from "@/shared/currencies";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { Loading, ErrorState } from "./inventoryShared";
export function CitypakWaybills() {
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [payment, setPayment] = useState("");
  const query = useQuery({
    queryKey: ["commerce", "citypak"],
    queryFn: () => getCitypakDashboard(),
  });
  const refresh = useMutation({
    mutationFn: (data: { orderId: string; shipmentId: string }) =>
      refreshOrderShipment({ data }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["commerce"] }),
    onError: (e) => toast.error(getStandardErrorMessage(e)),
  });
  if (query.isLoading) return <Loading />;
  if (query.isError) return <ErrorState error={query.error} />;
  const rows = query.data?.rows || [];
  const filtered = rows.filter(
    ({ shipment, order }) =>
      (!status || shipment.status === status) &&
      (!payment || order.paymentStatus === payment) &&
      `${order.orderNumber} ${shipment.trackingNumber} ${order.customerName} ${order.customerPhone}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Citypak Waybills</h1>
      <div className="flex flex-wrap gap-3">
        {[
          ["Total", rows.length],
          ["Paid", rows.filter((r) => r.order.paymentStatus === "paid").length],
          [
            "COD / unpaid",
            rows.filter((r) => r.order.paymentStatus !== "paid").length,
          ],
          [
            "In transit",
            rows.filter(
              (r) => !["DELIVERED", "RETURNED"].includes(r.shipment.status),
            ).length,
          ],
        ].map(([label, count]) => (
          <div className="rounded-lg border border-base-300 p-3" key={label}>
            <p className="text-xs">{label}</p>
            <p className="text-xl font-semibold">{count}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          className="input input-bordered input-sm flex-1"
          placeholder="Search order, tracking, customer or phone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="select select-bordered select-sm"
          value={payment}
          onChange={(e) => setPayment(e.target.value)}
        >
          <option value="">All payment states</option>
          {["paid", "partial", "unpaid", "refunded"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <select
          className="select select-bordered select-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All delivery states</option>
          {Array.from(new Set(rows.map((r) => r.shipment.status))).map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <button
          className="btn btn-outline btn-sm"
          onClick={() => void query.refetch()}
        >
          Reload
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Tracking</th>
              <th>Payment</th>
              <th>Total</th>
              <th>Status</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(({ shipment, order }) => (
              <tr key={shipment.id}>
                <td>{order.orderNumber}</td>
                <td>
                  {order.customerName}
                  <p className="text-xs">{order.customerPhone}</p>
                </td>
                <td>{shipment.trackingNumber}</td>
                <td>{order.paymentStatus}</td>
                <td>
                  {formatMoney(order.totalMinor, order.currency || "LKR")}
                </td>
                <td>
                  {shipment.status}
                  <p className="text-xs">{shipment.reason}</p>
                </td>
                <td>
                  {shipment.checkedAt
                    ? new Date(shipment.checkedAt).toLocaleString()
                    : "Not checked"}
                </td>
                <td>
                  <button
                    className="btn btn-ghost btn-xs"
                    disabled={refresh.isPending}
                    onClick={() =>
                      refresh.mutate({
                        orderId: order.id,
                        shipmentId: shipment.id,
                      })
                    }
                  >
                    Refresh
                  </button>
                  <a
                    className="btn btn-ghost btn-xs"
                    target="_blank"
                    rel="noreferrer"
                    href={`/api/orders/${encodeURIComponent(order.id)}/label?organizationId=${encodeURIComponent(query.data?.organizationId || "")}&shipmentId=${encodeURIComponent(shipment.id)}`}
                  >
                    A4 label
                  </a>
                  <a
                    className="btn btn-ghost btn-xs"
                    target="_blank"
                    rel="noreferrer"
                    href={`/api/orders/${encodeURIComponent(order.id)}/label?organizationId=${encodeURIComponent(query.data?.organizationId || "")}&shipmentId=${encodeURIComponent(shipment.id)}&size=4X6`}
                  >
                    4×6 label
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 1000 ? (
        <p className="text-xs">
          Showing the newest 1,000 waybills. Filters search only these records.
        </p>
      ) : null}
    </div>
  );
}

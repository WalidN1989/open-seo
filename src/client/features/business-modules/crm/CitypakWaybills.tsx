import { CitypakSenderPanel } from "./CitypakSenderPanel";
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
  const [payment, setPayment] = useState<
    "" | "paid" | "partial" | "unpaid" | "refunded"
  >("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [offset, setOffset] = useState(0);
  const query = useQuery({
    queryKey: [
      "commerce",
      "citypak",
      search,
      status,
      payment,
      paymentMethod,
      offset,
    ],
    queryFn: () =>
      getCitypakDashboard({
        data: { search, status, payment, paymentMethod, offset, limit: 50 },
      }),
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
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Citypak Waybills</h1>
      <CitypakSenderPanel />
      <div className="flex flex-wrap gap-3">
        {[
          ["Total", query.data?.total || 0],
          ["Paid", query.data?.paid || 0],
          ["COD / unpaid", (query.data?.total || 0) - (query.data?.paid || 0)],
          ["In transit", query.data?.inTransit || 0],
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
          onChange={(e) => {
            setSearch(e.target.value);
            setOffset(0);
          }}
        />
        <select
          className="select select-bordered select-sm"
          value={payment}
          onChange={(e) => {
            const value = e.target.value;
            if (
              value === "" ||
              value === "paid" ||
              value === "partial" ||
              value === "unpaid" ||
              value === "refunded"
            )
              setPayment(value);
            setOffset(0);
          }}
        >
          <option value="">All payment states</option>
          {["paid", "partial", "unpaid", "refunded"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <select
          className="select select-bordered select-sm"
          value={paymentMethod}
          onChange={(event) => {
            setPaymentMethod(event.target.value);
            setOffset(0);
          }}
        >
          <option value="">All payment methods</option>
          <option value="__unset__">None / unmapped</option>
          {query.data?.paymentMethods.map((method) => (
            <option key={method} value={method}>
              {method}
            </option>
          ))}
        </select>
        <select
          className="select select-bordered select-sm"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setOffset(0);
          }}
        >
          <option value="">All delivery states</option>
          {[
            "PENDING",
            "FIRST MILE RECEIVE SCAN",
            "DISPATCHED",
            "IN TRANSIT",
            "OUT FOR DELIVERY",
            "DELIVERED",
            "NOT DELIVERED",
            "RETURNED",
            "RTM",
            "UNKNOWN",
          ].map((v) => (
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
            {rows.map(({ shipment, order }) => (
              <tr key={shipment.id}>
                <td>{order.orderNumber}</td>
                <td>
                  {order.customerName}
                  <p className="text-xs">{order.customerPhone}</p>
                </td>
                <td>{shipment.trackingNumber}</td>
                <td>
                  {order.paymentStatus}
                  <p className="text-xs">
                    {order.paymentMethod || "None / unmapped"}
                  </p>
                </td>
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
      {rows.length === 0 ? (
        <p className="text-sm">No waybills match the filters.</p>
      ) : null}
      <div className="flex items-center gap-2">
        <button
          className="btn btn-outline btn-sm"
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - 50))}
        >
          Previous
        </button>
        <span className="text-sm">
          {query.data?.total
            ? `${offset + 1}–${offset + rows.length} of ${query.data.total}`
            : "0 waybills"}
        </span>
        <button
          className="btn btn-outline btn-sm"
          disabled={offset + rows.length >= (query.data?.total || 0)}
          onClick={() => setOffset(offset + 50)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

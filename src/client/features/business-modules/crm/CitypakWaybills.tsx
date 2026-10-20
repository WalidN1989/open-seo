import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getCitypakDashboard,
  refreshOrderShipment,
} from "@/serverFunctions/orders";
import { Link, useParams } from "@tanstack/react-router";
import { Truck, RefreshCw, Search } from "lucide-react";
import { CitypakWaybillRow } from "./CitypakWaybillRow";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { Loading, ErrorState } from "./inventoryShared";
export function CitypakWaybills() {
  const client = useQueryClient();
  const { projectId } = useParams({
    from: "/_project/p/$projectId/modules/crm/citypak",
  });
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
    refetchInterval: 60_000,
    queryFn: () =>
      getCitypakDashboard({
        data: { search, status, payment, paymentMethod, offset, limit: 50 },
      }),
  });
  const refresh = useMutation({
    mutationFn: (data: { orderId: string; shipmentId: string }) =>
      refreshOrderShipment({ data }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["commerce"] });
      toast.success("Checked Citypak for the latest delivery status");
    },
    onError: (e) => toast.error(getStandardErrorMessage(e)),
  });
  if (query.isLoading) return <Loading />;
  if (query.isError) return <ErrorState error={query.error} />;
  const rows = query.data?.rows || [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Truck className="size-6 text-primary" /> Citypak waybills
          </h1>
          <p className="mt-1 text-sm text-base-content/60">
            Manage deliveries, check courier scans and print shipping labels.
          </p>
        </div>
        <Link
          className="btn btn-primary btn-sm"
          to="/p/$projectId/modules/crm/orders"
          params={{ projectId }}
        >
          Open orders
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Total waybills", query.data?.total || 0],
          ["Awaiting courier scan", query.data?.awaitingScan || 0],
          ["In transit", query.data?.inTransit || 0],
          ["Delivered", query.data?.delivered || 0],
        ].map(([label, count]) => (
          <div
            className="rounded-xl border border-base-300 bg-base-100 p-4"
            key={label}
          >
            <p className="text-xs font-medium text-base-content/60">{label}</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{count}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-base-content/60">
        New waybills are created after order approval when fulfillment is
        enabled in order settings. Active deliveries are checked every two hours
        when automatic tracking is enabled. Refresh checks Citypak immediately.
      </p>
      <div className="flex flex-wrap gap-2">
        <Search
          aria-hidden="true"
          className="my-2 size-4 text-base-content/50"
        />
        <input
          aria-label="Search Citypak waybills"
          className="input input-bordered input-sm min-w-48 flex-1"
          placeholder="Search order, tracking, customer or phone"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOffset(0);
          }}
        />
        <select
          className="select select-bordered select-sm"
          aria-label="Payment state"
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
          aria-label="Payment method"
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
          aria-label="Delivery status"
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
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          <RefreshCw
            aria-hidden="true"
            className={`size-4 ${query.isFetching ? "animate-spin" : ""}`}
          />{" "}
          Reload list
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-base-300 bg-base-100">
        <table className="table table-sm [&_td]:py-4">
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Tracking</th>
              <th>Payment</th>
              <th>Total</th>
              <th>Status</th>
              <th>Tracking times</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <CitypakWaybillRow
                key={row.shipment.id}
                row={row}
                organizationId={query.data?.organizationId || ""}
                refreshing={
                  refresh.isPending &&
                  refresh.variables?.shipmentId === row.shipment.id
                }
                refreshDisabled={refresh.isPending}
                onRefresh={() =>
                  refresh.mutate({
                    orderId: row.order.id,
                    shipmentId: row.shipment.id,
                  })
                }
              />
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-base-300 p-8 text-center">
          <Truck className="mx-auto mb-3 size-8 text-base-content/40" />
          <p className="font-medium">No waybills match these filters</p>
          <p className="mt-1 text-sm text-base-content/60">
            New deliveries appear here after waybill creation. Link an existing
            tracking number from the order to bring older deliveries into this
            view.
          </p>
        </div>
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

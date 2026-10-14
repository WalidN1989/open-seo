import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getOrderReturnHistory } from "@/serverFunctions/orderWorkspace";
import { orderHistorySchema } from "@/types/schemas/orderHistory";
import { ErrorState, Loading } from "./inventoryShared";
import { OrderDetail } from "./OrderDetail";
import type { z } from "zod";
const labels = {
  delivered: "Delivered",
  returned: "Returned",
  returned_refunded: "Returned & Refunded",
  refunded: "Refunded",
  cancelled: "Cancelled",
};
export function OrderReturnsView() {
  const now = new Date();
  const [month, setMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  );
  const [category, setCategory] =
    useState<z.infer<typeof orderHistorySchema>["category"]>("all");
  const [offset, setOffset] = useState(0);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["commerce", "returns", month, category, offset],
    queryFn: () =>
      getOrderReturnHistory({ data: { month, category, offset, limit: 50 } }),
    enabled: orderHistorySchema.safeParse({ month, category }).success,
  });
  const data = query.data;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm">
          Filter by Month
          <input
            aria-label="Filter by Month"
            type="month"
            min="2000-01"
            max="2099-12"
            value={month}
            className="input input-bordered input-sm mt-1 block"
            onChange={(event) => {
              setMonth(event.target.value);
              setOffset(0);
              setOpenOrderId(null);
            }}
          />
        </label>
        <label className="text-sm">
          Filter by Type
          <select
            aria-label="Filter by Type"
            value={category}
            className="select select-bordered select-sm mt-1 block"
            onChange={(event) => {
              const value = orderHistorySchema.shape.category.safeParse(
                event.target.value,
              );
              if (value.success) {
                setCategory(value.data);
                setOffset(0);
                setOpenOrderId(null);
              }
            }}
          >
            <option value="all">All types</option>
            <option value="delivered">Delivered</option>
            <option value="returned">Returns</option>
            <option value="refunded">Refunds</option>
            <option value="cancelled">Cancellations</option>
          </select>
        </label>
      </div>
      <p className="text-xs text-base-content/60">
        Orders created in the selected month. Dates show recorded
        delivery/cancellation events when available, otherwise the last order
        update. Refund amounts and courier expenses are unavailable until their
        financial records are imported or entered.
      </p>
      {!month ? (
        <p className="text-sm">Choose a month to view history.</p>
      ) : query.isLoading ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState error={query.error} />
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            {[
              ["Delivered", data.counts.delivered],
              ["Returns", data.counts.returned],
              ["Refunds", data.counts.refunded],
              ["Cancellations", data.counts.cancelled],
              ["Courier Expenses", "Unavailable"],
              ["Total Refunded", "Unavailable"],
            ].map(([label, value]) => (
              <div
                className="rounded-lg border border-base-300 p-3"
                key={label}
              >
                <p className="text-xs text-base-content/60">{label}</p>
                <p className="mt-1 text-lg font-semibold">{value}</p>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto rounded-lg border border-base-300">
            <table className="table table-sm">
              <thead>
                <tr>
                  {[
                    "Date",
                    "Order",
                    "Customer",
                    "Status",
                    "Reason",
                    "Courier",
                    "Refund",
                    "Inventory",
                  ].map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <OrderHistoryRow
                    key={row.id}
                    row={row}
                    open={openOrderId === row.id}
                    onOpen={() =>
                      setOpenOrderId(openOrderId === row.id ? null : row.id)
                    }
                  />
                ))}
                {!data.rows.length ? (
                  <tr>
                    <td
                      className="py-10 text-center text-base-content/60"
                      colSpan={8}
                    >
                      No recorded history for this month and type.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-end gap-3">
            <span className="text-xs">
              {data.total
                ? `${offset + 1}–${Math.min(offset + data.rows.length, data.total)} of ${data.total}`
                : "0 records"}
            </span>
            <button
              className="btn btn-ghost btn-sm"
              disabled={offset === 0 || query.isFetching}
              onClick={() => {
                setOffset(Math.max(0, offset - 50));
                setOpenOrderId(null);
              }}
            >
              Previous
            </button>
            <button
              className="btn btn-ghost btn-sm"
              disabled={
                offset + data.rows.length >= data.total || query.isFetching
              }
              onClick={() => {
                setOffset(offset + 50);
                setOpenOrderId(null);
              }}
            >
              Next
            </button>
          </div>
          <p className="text-xs text-base-content/60">
            Counts cover the selected month across all types. This view does not
            issue a financial refund or change source orders.
          </p>
        </>
      ) : null}
    </div>
  );
}
function OrderHistoryRow({
  row,
  open,
  onOpen,
}: {
  row: Awaited<ReturnType<typeof getOrderReturnHistory>>["rows"][number];
  open: boolean;
  onOpen: () => void;
}) {
  return (
    <>
      <tr>
        <td className="whitespace-nowrap text-xs">
          {new Date(row.date).toLocaleDateString()}
        </td>
        <td>
          <button
            className="text-primary"
            aria-expanded={open}
            onClick={onOpen}
          >
            {row.orderNumber}
          </button>
        </td>
        <td>{row.customerName || "—"}</td>
        <td>
          <span className="badge badge-outline badge-sm">
            {row.status ? labels[row.status] : "Unknown"}
          </span>
        </td>
        <td>{row.reason || "Not recorded"}</td>
        <td className="text-base-content/60">Unavailable</td>
        <td className="text-base-content/60">Unavailable</td>
        <td>{row.inventoryRestored ? "Restored" : "Not recorded"}</td>
      </tr>
      {open ? (
        <tr>
          <td colSpan={8}>
            <OrderDetail orderId={row.id} status={row.orderStatus} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

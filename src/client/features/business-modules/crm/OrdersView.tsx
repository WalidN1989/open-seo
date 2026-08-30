import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, ShoppingCart } from "lucide-react";
import {
  cancelCommerceOrder,
  confirmCommerceOrder,
  createCommerceOrder,
  getCommerceOrder,
  listCommerceOrders,
  returnCommerceOrder,
} from "@/serverFunctions/commerce";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { useWorkspaceCurrency } from "@/client/hooks/useWorkspaceCurrency";
import { ErrorState, Loading } from "./inventoryShared";

const ORDERS_KEY = ["commerce", "orders"];

export function CrmOrdersView() {
  const money = useWorkspaceCurrency();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);

  const orders = useQuery({
    queryKey: ORDERS_KEY,
    queryFn: () => listCommerceOrders({ data: { limit: 50 } }),
  });

  const create = useMutation({
    mutationFn: (input: {
      description: string;
      quantity: number;
      unitPriceMinor: number;
    }) =>
      createCommerceOrder({
        data: {
          discountMinor: 0,
          deliveryMinor: 0,
          taxMinor: 0,
          lines: [input],
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
      setCreating(false);
      toast.success("Draft order created");
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  if (orders.isLoading) return <Loading />;
  if (orders.isError) return <ErrorState error={orders.error} />;

  const rows = orders.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Orders</h1>
          <p className="text-sm text-base-content/60">
            Orders draft first. Stock moves only when one is confirmed.
          </p>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setCreating((open) => !open)}
        >
          <Plus className="size-4" /> Order
        </button>
      </div>

      {creating ? (
        <form
          className="flex flex-wrap items-end gap-2 rounded-xl border border-base-300 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const read = (name: string) => {
              const value = form.get(name);
              return typeof value === "string" ? value.trim() : "";
            };
            const price = Number(read("price"));
            const quantity = Number(read("quantity"));
            if (!Number.isFinite(price) || price < 0) {
              toast.error("Enter a price as a positive amount.");
              return;
            }
            if (!Number.isInteger(quantity) || quantity < 1) {
              toast.error("Enter a whole quantity of at least one.");
              return;
            }
            create.mutate({
              description: read("description"),
              quantity,
              unitPriceMinor: Math.round(price * 100),
            });
          }}
        >
          <input
            name="description"
            placeholder="what was ordered"
            required
            className="input input-bordered input-sm flex-1"
          />
          <input
            name="quantity"
            type="number"
            min="1"
            step="1"
            defaultValue="1"
            className="input input-bordered input-sm w-24"
          />
          <input
            name="price"
            type="number"
            min="0"
            step="0.01"
            placeholder="unit price"
            className="input input-bordered input-sm w-32"
          />
          <button
            className="btn btn-primary btn-sm"
            disabled={create.isPending}
          >
            Save draft
          </button>
        </form>
      ) : null}

      <section className="rounded-xl border border-base-300">
        <div className="border-b border-base-300 p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <ShoppingCart className="size-4" /> Orders
            <span className="badge badge-sm ml-1">{rows.length}</span>
          </h2>
        </div>
        {rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-base-content/50">
            No orders yet
          </p>
        ) : (
          <div className="divide-y divide-base-300">
            {rows.map((order) => (
              <div key={order.id} className="p-4">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 text-left"
                  onClick={() =>
                    setOpenOrderId((open) =>
                      open === order.id ? null : order.id,
                    )
                  }
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{order.orderNumber}</p>
                    <p className="text-xs text-base-content/50">
                      {new Date(order.createdAt).toLocaleString()} ·{" "}
                      {order.fulfilmentStatus}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium">
                      {money.format(order.totalMinor)}
                    </span>
                    <OrderStatus status={order.status} />
                  </div>
                </button>
                {openOrderId === order.id ? (
                  <OrderDetail orderId={order.id} status={order.status} />
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function OrderDetail({ orderId, status }: { orderId: string; status: string }) {
  const money = useWorkspaceCurrency();
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ["commerce", "order", orderId],
    queryFn: () => getCommerceOrder({ data: { orderId } }),
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ORDERS_KEY }),
      queryClient.invalidateQueries({
        queryKey: ["commerce", "order", orderId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["commerce", "inventory", "overview"],
      }),
    ]);
  };

  const settled = (message: string) => ({
    onSuccess: async () => {
      await refresh();
      toast.success(message);
    },
    onError: (error: unknown) => toast.error(getStandardErrorMessage(error)),
  });

  const confirm = useMutation({
    mutationFn: () => confirmCommerceOrder({ data: { orderId } }),
    ...settled("Order confirmed, stock deducted"),
  });
  const cancel = useMutation({
    mutationFn: () => cancelCommerceOrder({ data: { orderId } }),
    ...settled("Order cancelled"),
  });
  const returned = useMutation({
    mutationFn: () => returnCommerceOrder({ data: { orderId } }),
    ...settled("Order returned, stock restored"),
  });

  if (detail.isLoading) return <Loading />;
  if (detail.isError) return <ErrorState error={detail.error} />;

  const order = detail.data?.order;
  const lines = detail.data?.lines ?? [];

  return (
    <div className="mt-4 space-y-3 rounded-lg border border-base-300 p-3">
      <div className="overflow-x-auto">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Item</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Unit</th>
              <th className="text-right">Line</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id}>
                <td>
                  {line.description}
                  {line.sku ? (
                    <span className="ml-2 text-xs text-base-content/50">
                      {line.sku}
                    </span>
                  ) : null}
                </td>
                <td className="text-right">{line.quantity}</td>
                <td className="text-right">
                  {money.format(line.unitPriceMinor)}
                </td>
                <td className="text-right">
                  {money.format(line.lineTotalMinor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {order ? (
        <dl className="grid gap-1 text-sm sm:max-w-xs sm:justify-self-end">
          <Row label="Subtotal" value={money.format(order.subtotalMinor)} />
          {order.discountMinor > 0 ? (
            <Row
              label="Discount"
              value={`-${money.format(order.discountMinor)}`}
            />
          ) : null}
          {order.deliveryMinor > 0 ? (
            <Row label="Delivery" value={money.format(order.deliveryMinor)} />
          ) : null}
          {order.taxMinor > 0 ? (
            <Row label="Tax" value={money.format(order.taxMinor)} />
          ) : null}
          <Row label="Total" value={money.format(order.totalMinor)} strong />
        </dl>
      ) : null}

      <div className="flex justify-end gap-2">
        {status === "draft" ? (
          <button
            className="btn btn-primary btn-sm"
            disabled={confirm.isPending}
            onClick={() => confirm.mutate()}
          >
            Confirm order
          </button>
        ) : null}
        {status === "draft" || status === "confirmed" ? (
          <button
            className="btn btn-ghost btn-sm"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate()}
          >
            Cancel
          </button>
        ) : null}
        {status === "confirmed" ? (
          <button
            className="btn btn-outline btn-sm"
            disabled={returned.isPending}
            onClick={() => returned.mutate()}
          >
            Return
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex justify-between gap-6">
      <dt className="text-base-content/60">{label}</dt>
      <dd className={strong ? "font-semibold" : undefined}>{value}</dd>
    </div>
  );
}

function OrderStatus({ status }: { status: string }) {
  if (status === "confirmed") {
    return <span className="badge badge-success badge-sm">Confirmed</span>;
  }
  if (status === "cancelled") {
    return <span className="badge badge-ghost badge-sm">Cancelled</span>;
  }
  if (status === "returned") {
    return <span className="badge badge-warning badge-sm">Returned</span>;
  }
  return <span className="badge badge-outline badge-sm">Draft</span>;
}

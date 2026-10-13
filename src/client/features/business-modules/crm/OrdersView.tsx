import { formatMoney } from "@/shared/currencies";
import { OrderSequence } from "./OrderSequence";
import { OrderSyncPanel } from "./OrderSyncPanel";
import { OrderDetail } from "./OrderDetail";
import { BranchPicker, useBranchSelection } from "./BranchPicker";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, ShoppingCart } from "lucide-react";
import {
  createCommerceOrder,
  listCommerceOrders,
} from "@/serverFunctions/commerce";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { useWorkspaceCurrency } from "@/client/hooks/useWorkspaceCurrency";
import { ErrorState, Loading } from "./inventoryShared";

const ORDERS_KEY = ["commerce", "orders"];

export function CrmOrdersView() {
  const money = useWorkspaceCurrency();
  const queryClient = useQueryClient();
  const selection = useBranchSelection();
  const [tab, setTab] = useState<"all" | "pending" | "adjustments">("all");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [showSequence, setSequence] = useState(false);
  const [creating, setCreating] = useState(false);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);

  const orders = useQuery({
    queryKey: [...ORDERS_KEY, tab, search, offset],
    queryFn: () =>
      listCommerceOrders({ data: { limit: 50, tab, search, offset } }),
  });

  const create = useMutation({
    mutationFn: (input: {
      description: string;
      quantity: number;
      unitPriceMinor: number;
    }) =>
      createCommerceOrder({
        data: {
          branchId: selection.branchId,
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
            Review Shopify orders here while Zoho continues handling
            fulfillment.
          </p>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setCreating((open) => !open)}
        >
          <Plus className="size-4" /> Order
        </button>
      </div>

      <OrderSyncPanel />
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "pending", "adjustments"] as const).map((value) => (
          <button
            key={value}
            className={`btn btn-sm ${tab === value ? "btn-primary" : "btn-ghost"}`}
            onClick={() => {
              setSequence(false);
              setTab(value);
              setOffset(0);
              setOpenOrderId(null);
            }}
          >
            {value === "all"
              ? "All Orders"
              : value === "pending"
                ? "Pending Approval"
                : "Returns & Refunds"}
          </button>
        ))}
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setSequence(!showSequence)}
        >
          Missing Sequence
        </button>
        <input
          className="input input-bordered input-sm flex-1"
          placeholder="Search order ID or customer"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setOffset(0);
          }}
        />
      </div>
      {showSequence ? <OrderSequence /> : null}
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
          <BranchPicker selection={selection} />
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
            disabled={create.isPending || !selection.branchId}
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
                      {order.customerName || order.fulfilmentStatus}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium">
                      {formatMoney(
                        order.totalMinor,
                        order.currency || money.currency,
                      )}
                    </span>
                    <OrderStatus
                      status={
                        order.status === "draft" &&
                        order.approvalStatus === "rejected"
                          ? "review_rejected"
                          : order.status
                      }
                    />
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
      <div className="flex items-center justify-end gap-3">
        <button
          className="btn btn-ghost btn-sm"
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - 50))}
        >
          Previous
        </button>
        <span className="text-xs">Page {offset / 50 + 1}</span>
        <button
          className="btn btn-ghost btn-sm"
          disabled={rows.length < 50}
          onClick={() => setOffset(offset + 50)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

function OrderStatus({ status }: { status: string }) {
  if (status === "review_rejected")
    return (
      <span className="badge badge-warning badge-sm">Review rejected</span>
    );
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

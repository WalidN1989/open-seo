import { WooOrderSyncPanel } from "./WooOrderSyncPanel";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, FileText, Hash, RotateCcw, ShoppingCart } from "lucide-react";
import { getOrderWorkspace } from "@/serverFunctions/orderWorkspace";
import { useWorkspaceCurrency } from "@/client/hooks/useWorkspaceCurrency";
import { OrderReturnsView } from "./OrderReturnsView";
import { OrderSequence } from "./OrderSequence";
import { OrderSyncPanel } from "./OrderSyncPanel";
import { OrdersTable } from "./OrdersTable";
import { OrderExportButton } from "./OrderExportButton";
import { OrderCreateForm } from "./OrderCreateForm";
import { ErrorState, Loading } from "./inventoryShared";
const tabs = [
  { key: "all", label: "All Orders", icon: FileText },
  { key: "create", label: "Create Order", icon: ShoppingCart },
  { key: "pending", label: "Pending Approval", icon: Clock },
  { key: "adjustments", label: "Returns & Refunds", icon: RotateCcw },
  { key: "sequence", label: "Missing Sequence", icon: Hash },
] as const;
type Tab = (typeof tabs)[number]["key"];
export function CrmOrdersView() {
  const money = useWorkspaceCurrency();
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const listTab = tab === "pending" || tab === "adjustments" ? tab : "all";
  const orders = useQuery({
    queryKey: ["commerce", "orders", listTab, search, offset],
    queryFn: () =>
      getOrderWorkspace({ data: { limit: 50, tab: listTab, search, offset } }),
  });
  const rows = orders.data?.rows ?? [];
  const total = orders.data?.total ?? 0;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Orders</h1>
      <WooOrderSyncPanel />
      <OrderSyncPanel />
      <section className="rounded-xl border border-base-300 bg-base-100 p-3 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 pb-2">
          <div
            className="flex flex-wrap gap-1"
            role="tablist"
            aria-label="Order sections"
          >
            {tabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                aria-controls="order-tab-panel"
                className={`btn btn-sm ${tab === key ? "btn-primary" : "btn-ghost"}`}
                onClick={() => {
                  setTab(key);
                  setOffset(0);
                  setOpenOrderId(null);
                }}
              >
                <Icon className="size-3.5" />
                {label}
                {key === "pending" && orders.data ? (
                  <span className="badge badge-warning badge-sm">
                    {orders.data.pendingCount}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <OrderExportButton search={search} tab={listTab} />
            <OrderExportButton search={search} tab={listTab} lineItems />
          </div>
        </div>
        <div id="order-tab-panel" role="tabpanel" className="pt-4">
          {tab === "create" ? (
            <OrderCreateForm
              onCreated={(orderId) => {
                setTab("all");
                setOffset(0);
                setSearch("");
                setOpenOrderId(orderId);
              }}
            />
          ) : tab === "sequence" ? (
            <OrderSequence />
          ) : tab === "adjustments" ? (
            <OrderReturnsView />
          ) : (
            <>
              <input
                aria-label="Search orders"
                className="input input-bordered input-sm mb-4 w-full sm:max-w-md"
                placeholder="Search order #, tracking #, customer, SKU or book…"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setOffset(0);
                  setOpenOrderId(null);
                }}
              />
              {tab === "pending" && orders.data ? (
                <p className="mb-3 text-xs text-warning">{total} pending</p>
              ) : null}
              {orders.isLoading ? (
                <Loading />
              ) : orders.isError ? (
                <ErrorState error={orders.error} />
              ) : (
                <OrdersTable
                  rows={rows}
                  organizationId={orders.data?.organizationId || ""}
                  currency={money.currency}
                  openOrderId={openOrderId}
                  setOpenOrderId={setOpenOrderId}
                />
              )}
              <div className="mt-4 flex items-center justify-end gap-3">
                <span className="text-xs text-base-content/60">
                  {total
                    ? `${offset + 1}–${Math.min(offset + rows.length, total)} of ${total}`
                    : "0 orders"}
                </span>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={offset === 0 || orders.isFetching}
                  onClick={() => {
                    setOffset(Math.max(0, offset - 50));
                    setOpenOrderId(null);
                  }}
                >
                  Previous
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={offset + rows.length >= total || orders.isFetching}
                  onClick={() => {
                    setOffset(offset + 50);
                    setOpenOrderId(null);
                  }}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

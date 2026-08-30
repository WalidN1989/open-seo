import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { getInventoryOverview } from "@/serverFunctions/commerce";
import { AuditsTab } from "./InventoryAuditsTab";
import {
  ErrorState,
  INVENTORY_OVERVIEW_KEY as OVERVIEW_KEY,
  Loading,
} from "./inventoryShared";

type Tab = "stock" | "audits" | "movements";

export function CrmInventoryView() {
  const [tab, setTab] = useState<Tab>("stock");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Inventory</h1>
        <p className="text-sm text-base-content/60">
          Stock levels, counted audits and the movements behind every change.
        </p>
      </div>

      <div role="tablist" className="tabs tabs-border">
        <button
          role="tab"
          className={`tab ${tab === "stock" ? "tab-active" : ""}`}
          onClick={() => setTab("stock")}
        >
          Stock
        </button>
        <button
          role="tab"
          className={`tab ${tab === "audits" ? "tab-active" : ""}`}
          onClick={() => setTab("audits")}
        >
          Audits
        </button>
        <button
          role="tab"
          className={`tab ${tab === "movements" ? "tab-active" : ""}`}
          onClick={() => setTab("movements")}
        >
          Movements
        </button>
      </div>

      {tab === "stock" ? <StockTab /> : null}
      {tab === "audits" ? <AuditsTab /> : null}
      {tab === "movements" ? <MovementsTab /> : null}
    </div>
  );
}

function StockTab() {
  const query = useQuery({
    queryKey: OVERVIEW_KEY,
    queryFn: () => getInventoryOverview(),
  });

  if (query.isLoading) return <Loading />;
  if (query.isError) return <ErrorState error={query.error} />;

  const lowStock = query.data?.lowStock ?? [];

  return (
    <section className="rounded-xl border border-base-300">
      <div className="border-b border-base-300 p-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <TriangleAlert className="size-4" /> Low stock
          <span className="badge badge-sm ml-1">{lowStock.length}</span>
        </h2>
        <p className="mt-1 text-xs text-base-content/50">
          Active products at or below their reorder threshold.
        </p>
      </div>
      {lowStock.length === 0 ? (
        <p className="p-8 text-center text-sm text-base-content/50">
          Nothing is below its reorder threshold
        </p>
      ) : (
        <div className="divide-y divide-base-300">
          {lowStock.map((row) => (
            <div
              key={row.product.id}
              className="flex items-center justify-between gap-3 p-4"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{row.product.name}</p>
                <p className="truncate text-xs text-base-content/50">
                  {row.product.sku} · reorder at {row.product.reorderThreshold}
                </p>
              </div>
              <span className="badge badge-warning badge-sm">
                {row.quantityOnHand} on hand
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function MovementsTab() {
  const query = useQuery({
    queryKey: OVERVIEW_KEY,
    queryFn: () => getInventoryOverview(),
  });

  if (query.isLoading) return <Loading />;
  if (query.isError) return <ErrorState error={query.error} />;

  const movements = query.data?.movements ?? [];

  return (
    <section className="rounded-xl border border-base-300">
      <div className="border-b border-base-300 p-4">
        <h2 className="font-semibold">
          Recent movements
          <span className="badge badge-sm ml-1">{movements.length}</span>
        </h2>
        <p className="mt-1 text-xs text-base-content/50">
          Every stock change is recorded and never edited.
        </p>
      </div>
      {movements.length === 0 ? (
        <p className="p-8 text-center text-sm text-base-content/50">
          No stock movements yet
        </p>
      ) : (
        <div className="divide-y divide-base-300">
          {movements.map((movement) => (
            <div
              key={movement.id}
              className="flex items-center justify-between gap-3 p-4"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {movement.movementType}
                  {movement.reason ? ` · ${movement.reason}` : ""}
                </p>
                <p className="text-xs text-base-content/50">
                  {new Date(movement.createdAt).toLocaleString()}
                </p>
              </div>
              <span
                className={`badge badge-sm ${movement.quantityDelta < 0 ? "badge-error" : "badge-success"}`}
              >
                {movement.quantityDelta > 0
                  ? `+${movement.quantityDelta}`
                  : movement.quantityDelta}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

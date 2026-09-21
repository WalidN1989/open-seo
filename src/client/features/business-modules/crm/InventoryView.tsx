import { BranchPicker, useBranchSelection } from "./BranchPicker";
import { BranchesTab } from "./BranchesTab";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { getInventoryOverview } from "@/serverFunctions/commerce";
import {
  ArrowDownUp,
  CalendarClock,
  ArrowLeftRight,
  Barcode,
  Boxes,
  ClipboardList,
} from "lucide-react";
import { StockAsOfTab } from "./StockAsOfTab";
import { StockTransferTab } from "./StockTransferTab";
import { StockTakeTab } from "./StockTakeTab";
import { AuditsTab } from "./InventoryAuditsTab";
import {
  ErrorState,
  INVENTORY_OVERVIEW_KEY as OVERVIEW_KEY,
  Loading,
} from "./inventoryShared";

type Tab =
  | "branches"
  | "count"
  | "audits"
  | "transfer"
  | "asOf"
  | "stock"
  | "movements";

export function CrmInventoryView() {
  const selection = useBranchSelection();
  const { branchId } = selection;
  const [tab, setTab] = useState<Tab>("count");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Inventory</h1>
        <p className="text-sm text-base-content/60">
          Stock levels, counted audits and the movements behind every change.
        </p>
      </div>

      <BranchPicker selection={selection} />
      <div role="tablist" className="tabs tabs-border">
        <button
          role="tab"
          className={`tab gap-2 ${branchId && tab === "count" ? "tab-active" : ""}`}
          onClick={() => setTab("count")}
        >
          <Barcode className="size-4" /> Stock take
        </button>
        <button
          role="tab"
          className={`tab gap-2 ${branchId && tab === "audits" ? "tab-active" : ""}`}
          onClick={() => setTab("audits")}
        >
          <ClipboardList className="size-4" /> Inventory audits
        </button>
        <button
          role="tab"
          className={`tab gap-2 ${branchId && tab === "transfer" ? "tab-active" : ""}`}
          onClick={() => setTab("transfer")}
        >
          <ArrowDownUp className="size-4" /> Export / import
        </button>
        <button
          role="tab"
          className={`tab gap-2 ${branchId && tab === "asOf" ? "tab-active" : ""}`}
          onClick={() => setTab("asOf")}
        >
          <CalendarClock className="size-4" /> Stock as of date
        </button>
        <button
          role="tab"
          className={`tab gap-2 ${branchId && tab === "stock" ? "tab-active" : ""}`}
          onClick={() => setTab("stock")}
        >
          <Boxes className="size-4" /> Stock
        </button>
        <button
          role="tab"
          className={`tab gap-2 ${branchId && tab === "movements" ? "tab-active" : ""}`}
          onClick={() => setTab("movements")}
        >
          <ArrowLeftRight className="size-4" /> Movements
        </button>
        <button
          role="tab"
          className={`tab ${tab === "branches" ? "tab-active" : ""}`}
          onClick={() => setTab("branches")}
        >
          Branches
        </button>
      </div>

      {tab === "branches" ? <BranchesTab /> : null}
      <div key={branchId}>
        {branchId && tab === "stock" ? <StockTab branchId={branchId} /> : null}
        {branchId && tab === "count" ? (
          <StockTakeTab branchId={branchId} />
        ) : null}
        {branchId && tab === "audits" ? (
          <AuditsTab branchId={branchId} />
        ) : null}
        {branchId && tab === "transfer" ? (
          <StockTransferTab branchId={branchId} />
        ) : null}
        {branchId && tab === "asOf" ? (
          <StockAsOfTab branchId={branchId} />
        ) : null}
        {branchId && tab === "movements" ? (
          <MovementsTab branchId={branchId} />
        ) : null}
      </div>
    </div>
  );
}

function StockTab({ branchId }: { branchId: string }) {
  const query = useQuery({
    queryKey: [...OVERVIEW_KEY, branchId],
    queryFn: () => getInventoryOverview({ data: { branchId } }),
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

function MovementsTab({ branchId }: { branchId: string }) {
  const query = useQuery({
    queryKey: [...OVERVIEW_KEY, branchId],
    queryFn: () => getInventoryOverview({ data: { branchId } }),
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

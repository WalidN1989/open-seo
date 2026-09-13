import { useState } from "react";
import { Package, Search, Wrench } from "lucide-react";
import { formatMoney } from "@/server/features/invoicing/invoiceTotals";
import { useCatalogueSearch, type CatalogueItem } from "./quotesQuery";

/** Search the products and services catalogue and add one as a quote line. */
export function CataloguePicker({
  currency,
  onPick,
}: {
  currency: string;
  onPick: (item: CatalogueItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const query = useCatalogueSearch(search, open);

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-outline btn-sm"
        onClick={() => setOpen(true)}
      >
        <Package className="size-4" /> Add from products &amp; services
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-base-300 bg-base-100 p-3">
      <div className="flex items-center gap-2">
        <label className="input input-bordered input-sm flex flex-1 items-center gap-2">
          <Search className="size-3.5 text-base-content/50" />
          <input
            autoFocus
            className="grow"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or SKU"
          />
        </label>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setOpen(false)}
        >
          Close
        </button>
      </div>
      <div className="mt-2 max-h-72 overflow-y-auto">
        {query.isPending ? (
          <div className="flex justify-center py-6">
            <span className="loading loading-spinner loading-sm" />
          </div>
        ) : query.data?.length ? (
          query.data.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onPick(item)}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-base-200"
            >
              {item.itemType === "service" ? (
                <Wrench className="size-4 shrink-0 text-violet-600" />
              ) : (
                <Package className="size-4 shrink-0 text-sky-600" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {item.name}
                </span>
                <span className="block truncate text-xs text-base-content/55">
                  {item.itemType === "service" ? "Service" : "Product"} ·{" "}
                  {item.sku}
                  {item.category ? ` · ${item.category}` : ""}
                </span>
              </span>
              <span className="text-sm font-semibold">
                {formatMoney(item.salePriceMinor, currency)}
              </span>
            </button>
          ))
        ) : (
          <p className="py-6 text-center text-sm text-base-content/55">
            Nothing found. Add products and services under CRM → Products.
          </p>
        )}
      </div>
    </div>
  );
}

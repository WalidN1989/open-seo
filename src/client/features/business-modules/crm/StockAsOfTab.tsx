import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Download } from "lucide-react";
import { getStockAsOf } from "@/serverFunctions/commerce";
import { ErrorState, Loading } from "./inventoryShared";

/**
 * What was on hand on a day that has already passed.
 *
 * Accounts and auditors ask this months later — what did we hold on 30 June —
 * and the answer has to be the same every time it is asked. It is worked out
 * from the movement ledger, not stored, so a count published today changes
 * today's figure and leaves June's alone.
 */

function today() {
  return new Date().toISOString().slice(0, 10);
}

function cell(value: string | number) {
  return /[",\n]/.test(String(value))
    ? `"${String(value).replaceAll('"', '""')}"`
    : String(value);
}

function csv(
  rows: readonly { sku: string; name: string; quantityThen: number }[],
  day: string,
) {
  return [
    `SKU,Product,On hand ${day}`,
    ...rows.map((row) =>
      [row.sku, row.name, row.quantityThen].map(cell).join(","),
    ),
  ].join("\n");
}

export function StockAsOfTab({ branchId }: { branchId: string }) {
  const [day, setDay] = useState(today);

  const stock = useQuery({
    queryKey: ["commerce", "inventory", "as-of", day, branchId],
    queryFn: () => getStockAsOf({ data: { day, branchId } }),
  });

  const rows = stock.data ?? [];
  const held = rows.filter((row) => row.quantityThen !== 0);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-base-300 p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <CalendarClock className="size-4 text-base-content/60" /> Stock as of
          a date
        </h2>
        <p className="mt-1 text-sm text-base-content/60">
          What was on hand at the end of that day, worked out from every
          movement since.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            type="date"
            className="input input-bordered input-sm"
            value={day}
            max={today()}
            onChange={(event) => setDay(event.target.value || today())}
          />
          <button
            className="btn btn-outline btn-sm"
            disabled={held.length === 0}
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([csv(held, day)], { type: "text/csv;charset=utf-8" }),
              );
              const link = document.createElement("a");
              link.href = url;
              link.download = `stock-as-of-${day}.csv`;
              link.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download className="size-4" /> Export CSV
          </button>
          <span className="text-sm text-base-content/60">
            {held.length} product{held.length === 1 ? "" : "s"} held that day
          </span>
        </div>
      </section>

      {stock.isLoading ? <Loading /> : null}
      {stock.isError ? <ErrorState error={stock.error} /> : null}

      {!stock.isLoading && !stock.isError ? (
        <div className="overflow-x-auto rounded-xl border border-base-300">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th className="text-right">On hand that day</th>
                <th className="text-right">Moved since</th>
                <th className="text-right">On hand now</th>
              </tr>
            </thead>
            <tbody>
              {held.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="py-8 text-center text-sm text-base-content/50"
                  >
                    Nothing was on hand on {day}.
                  </td>
                </tr>
              ) : (
                held.map((row) => (
                  <tr key={row.id}>
                    <td className="max-w-sm truncate">{row.name}</td>
                    <td className="font-mono text-xs">{row.sku}</td>
                    <td className="text-right font-medium">
                      {row.quantityThen}
                    </td>
                    <td className="text-right text-base-content/60">
                      {row.movedSince > 0
                        ? `+${row.movedSince}`
                        : row.movedSince}
                    </td>
                    <td className="text-right text-base-content/60">
                      {row.quantityNow}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

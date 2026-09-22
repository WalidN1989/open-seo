import type { Dispatch, SetStateAction } from "react";
import { Trash2 } from "lucide-react";
import { removeLine, setCount } from "./stockTakeSession";
import type { countedLines, StockTakeState } from "./stockTakeSession";

export function StockTakeLines({
  session,
  setSession,
  lines,
}: {
  session: StockTakeState;
  setSession: Dispatch<SetStateAction<StockTakeState | null>>;
  lines: ReturnType<typeof countedLines>;
}) {
  if (lines.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-base-300 p-6 text-center text-sm text-base-content/60">
        Scan the first item. Each scan of the same barcode adds one.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-base-300">
      <table className="table table-sm">
        <thead>
          <tr>
            <th>Product</th>
            <th>SKU</th>
            <th className="text-right">In stock</th>
            <th className="text-right">Counted</th>
            <th className="text-right">Difference</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.productId}>
              <td className="max-w-xs truncate">{line.name}</td>
              <td className="font-mono text-xs">{line.sku}</td>
              <td className="text-right">{line.systemStock}</td>
              <td className="text-right">
                <input
                  type="number"
                  className="input input-bordered input-xs w-20 text-right"
                  value={line.counted}
                  min={0}
                  onChange={(event) =>
                    setSession(
                      setCount(
                        session,
                        line.productId,
                        Number(event.target.value),
                      ),
                    )
                  }
                />
              </td>
              <td
                className={`text-right font-medium ${
                  line.difference === 0
                    ? "text-base-content/50"
                    : line.difference > 0
                      ? "text-success"
                      : "text-error"
                }`}
              >
                {line.difference > 0 ? `+${line.difference}` : line.difference}
              </td>
              <td className="text-right">
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  aria-label={`Remove ${line.name}`}
                  onClick={() =>
                    setSession(removeLine(session, line.productId))
                  }
                >
                  <Trash2 className="size-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

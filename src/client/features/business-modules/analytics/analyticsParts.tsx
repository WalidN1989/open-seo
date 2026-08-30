import { TrendingDown, TrendingUp } from "lucide-react";

export function StatCard({
  label,
  value,
  change,
  hint,
}: {
  label: string;
  value: string;
  change?: number | null;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-base-300 p-4">
      <p className="text-xs uppercase tracking-wide text-base-content/50">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {/* No badge at all when there is nothing to compare against: "up 100%"
          from a base of zero says more than the data supports. */}
      {change != null ? (
        <p
          className={`mt-1 flex items-center gap-1 text-xs ${
            change >= 0 ? "text-success" : "text-error"
          }`}
        >
          {change >= 0 ? (
            <TrendingUp className="size-3" />
          ) : (
            <TrendingDown className="size-3" />
          )}
          {Math.abs(change)}% vs previous {label.toLowerCase()}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-base-content/40">{hint}</p>
      ) : null}
    </div>
  );
}

type Point = { day: string; orders: number; revenueMinor: number };

/**
 * Revenue over time as plain bars. Deliberately not a charting library: the
 * shape of a trend is all this needs to show, and a dependency for it would
 * cost more than it gives.
 */
export function RevenueTrend({
  points,
  format,
}: {
  points: readonly Point[];
  format: (minor: number, compact?: boolean) => string;
}) {
  if (points.length === 0) {
    return (
      <section className="rounded-xl border border-base-300 p-8 text-center text-sm text-base-content/50">
        No confirmed orders in this period.
      </section>
    );
  }

  const peak = Math.max(...points.map((point) => point.revenueMinor), 1);

  return (
    <section className="rounded-xl border border-base-300 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Revenue</h2>
        <span className="text-xs text-base-content/50">
          Peak {format(peak, true)}
        </span>
      </div>
      <div className="mt-4 flex h-32 items-end gap-1 overflow-x-auto">
        {points.map((point) => (
          <div
            key={point.day}
            className="group flex min-w-2 flex-1 flex-col justify-end"
            title={`${point.day}: ${format(point.revenueMinor)} across ${point.orders} order${point.orders === 1 ? "" : "s"}`}
          >
            <div
              className="rounded-t bg-primary/70 transition-colors group-hover:bg-primary"
              style={{
                height: `${Math.max(2, (point.revenueMinor / peak) * 100)}%`,
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-base-content/40">
        <span>{points[0]?.day}</span>
        <span>{points[points.length - 1]?.day}</span>
      </div>
    </section>
  );
}

export function TopProducts({
  products,
  format,
}: {
  products: ReadonlyArray<{
    sku: string | null;
    description: string;
    quantity: number;
    revenueMinor: number;
  }>;
  format: (minor: number, compact?: boolean) => string;
}) {
  return (
    <section className="rounded-xl border border-base-300 p-4">
      <h2 className="font-semibold">Best sellers</h2>
      {products.length === 0 ? (
        <p className="py-8 text-center text-sm text-base-content/50">
          Nothing sold in this period.
        </p>
      ) : (
        <table className="table table-sm mt-2">
          <thead>
            <tr>
              <th>Product</th>
              <th className="text-right">Units</th>
              <th className="text-right">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={`${product.sku ?? ""}-${product.description}`}>
                <td>
                  <span className="block truncate" title={product.description}>
                    {product.description}
                  </span>
                  {product.sku ? (
                    <span className="text-xs text-base-content/40">
                      {product.sku}
                    </span>
                  ) : null}
                </td>
                <td className="text-right tabular-nums">{product.quantity}</td>
                <td className="text-right tabular-nums">
                  {format(product.revenueMinor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

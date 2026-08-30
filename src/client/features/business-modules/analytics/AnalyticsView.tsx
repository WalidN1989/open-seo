import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getBusinessAnalytics } from "@/serverFunctions/commerce";
import { formatMoney } from "@/shared/currencies";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { RevenueTrend, StatCard, TopProducts } from "./analyticsParts";

const RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "12 months" },
];

/**
 * Business analytics — what the shop sold, and what it is holding.
 *
 * Every figure comes from the commerce tables. It is deliberately separate
 * from OpenSEO's SEO and Search Console reporting, which answers a different
 * question about a different thing.
 */
export function BusinessAnalyticsView() {
  const [days, setDays] = useState(30);

  const query = useQuery({
    queryKey: ["commerce", "analytics", days],
    queryFn: () => getBusinessAnalytics({ data: { days } }),
    placeholderData: (previous) => previous,
  });

  if (query.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <span className="loading loading-spinner" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div className="alert alert-error">
        {getStandardErrorMessage(query.error)}
      </div>
    );
  }

  const data = query.data;
  const money = (minor: number, compact = false) =>
    formatMoney(minor, data.currency, { compact });

  const drafts = data.statuses.find((row) => row.status === "draft");
  const cancelled = data.statuses.find((row) => row.status === "cancelled");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Analytics</h1>
          <p className="mt-1 text-base leading-6 text-base-content/65">
            Sales and stock, from your orders and inventory.
          </p>
        </div>
        <div className="join">
          {RANGES.map((range) => (
            <button
              key={range.days}
              className={`btn join-item btn-sm ${days === range.days ? "btn-active" : ""}`}
              onClick={() => setDays(range.days)}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Revenue"
          value={money(data.revenueMinor)}
          change={data.revenueChangePercent}
          hint="Confirmed orders only"
        />
        <StatCard
          label="Orders"
          value={data.orders.toLocaleString()}
          change={data.ordersChangePercent}
        />
        <StatCard label="Average order" value={money(data.averageOrderMinor)} />
        <StatCard
          label="Stock at cost"
          value={money(data.inventory.valueMinor)}
          hint={`${data.inventory.units.toLocaleString()} units`}
        />
      </div>

      <RevenueTrend points={data.byDay} format={money} />

      <div className="grid gap-4 lg:grid-cols-2">
        <TopProducts products={data.topProducts} format={money} />

        <section className="rounded-xl border border-base-300 p-4">
          <h2 className="font-semibold">Where things stand</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Line
              label="Products in catalogue"
              value={data.inventory.products.toLocaleString()}
            />
            <Line
              label="At or below reorder point"
              value={data.inventory.lowStock.toLocaleString()}
              tone={data.inventory.lowStock > 0 ? "warning" : undefined}
            />
            <Line
              label="Stock at retail"
              value={money(data.inventory.retailMinor)}
            />
            <Line
              label="Draft orders"
              value={`${drafts?.count ?? 0}`}
              hint="Enquiries not yet confirmed, so not counted as revenue"
            />
            <Line
              label="Cancelled or returned"
              value={`${cancelled?.count ?? 0}`}
            />
            <Line label="Discounts given" value={money(data.discountMinor)} />
            <Line label="Tax collected" value={money(data.taxMinor)} />
          </dl>
        </section>
      </div>
    </div>
  );
}

function Line({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "warning";
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-base-200 pb-2 last:border-0">
      <dt className="text-base-content/70">
        {label}
        {hint ? (
          <span className="block text-xs text-base-content/40">{hint}</span>
        ) : null}
      </dt>
      <dd
        className={`tabular-nums font-medium ${tone === "warning" ? "text-warning" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

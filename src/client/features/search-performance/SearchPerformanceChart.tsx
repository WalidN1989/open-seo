import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  formatCount,
  formatCtr,
  formatPosition,
  type Report,
} from "./SearchPerformanceColumns";

const METRICS = [
  { key: "clicks", label: "Clicks" },
  { key: "impressions", label: "Impressions" },
  { key: "ctr", label: "CTR" },
  { key: "position", label: "Average position" },
] as const;

export function SearchPerformanceChart({
  trend,
  prevTrend,
  showPosition = true,
}: {
  trend: Report["trend"];
  prevTrend: Report["prevTrend"];
  showPosition?: boolean;
}) {
  const [metric, setMetric] =
    useState<(typeof METRICS)[number]["key"]>("clicks");
  const activeMetric =
    !showPosition && metric === "position" ? "clicks" : metric;
  const format =
    activeMetric === "ctr"
      ? formatCtr
      : activeMetric === "position"
        ? formatPosition
        : formatCount;
  const data = trend.map((day, index) => ({
    index,
    date: day.date,
    previousDate: prevTrend[index]?.date,
    current: day[activeMetric],
    previous: prevTrend[index]?.[activeMetric] ?? null,
  }));
  const hasImpressions =
    trend.some((day) => day.impressions > 0) ||
    prevTrend.some((day) => day.impressions > 0);
  return (
    <section
      className="rounded-xl border border-base-300 bg-base-100 p-4"
      aria-label="Search performance trend"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Performance over time</h2>
        <div
          className="flex flex-wrap gap-1"
          role="group"
          aria-label="Chart metric"
        >
          {METRICS.filter(
            (item) => showPosition || item.key !== "position",
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              className={`btn btn-sm ${item.key === activeMetric ? "btn-primary" : "btn-ghost"}`}
              aria-pressed={item.key === activeMetric}
              onClick={() => setMetric(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {hasImpressions ? (
        <div
          className="h-64 w-full"
          role="img"
          aria-label={`${METRICS.find((item) => item.key === activeMetric)?.label}: current period compared with the previous period`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
            >
              <CartesianGrid
                vertical={false}
                stroke="currentColor"
                strokeOpacity={0.1}
              />
              <XAxis
                dataKey="date"
                tickFormatter={(date) => String(date).slice(5)}
                minTickGap={32}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                tickFormatter={format}
                width={65}
                tick={{ fontSize: 11 }}
                reversed={activeMetric === "position"}
                domain={activeMetric === "position" ? [1, "auto"] : [0, "auto"]}
              />
              <Tooltip
                formatter={(value) =>
                  typeof value === "number" ? format(value) : "—"
                }
                labelFormatter={(label) => {
                  const point = data.find((day) => day.date === label);
                  return point
                    ? `${point.date} / ${point.previousDate ?? "—"}`
                    : String(label);
                }}
              />
              <Line
                name="Current period"
                type="monotone"
                dataKey="current"
                stroke="var(--color-primary)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                name="Previous period"
                type="monotone"
                dataKey="previous"
                stroke="var(--color-primary)"
                strokeOpacity={0.45}
                strokeDasharray="5 4"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="py-12 text-center text-sm text-base-content/60">
          No impressions in either period yet.
        </p>
      )}
      <p className="mt-3 text-xs text-base-content/60">
        Solid line: current period. Dashed line: previous period, aligned by
        day. Search Console data trails by a few days.
        {activeMetric === "position"
          ? " A lower position is better; days without impressions have no position."
          : ""}
      </p>
    </section>
  );
}

import type {
  PositionBucket,
  ReportKeyword,
  SearchPerformance,
} from "@/server/features/reports/reportSnapshot";

/**
 * The report's charts, drawn as plain SVG.
 *
 * No charting library on purpose: this page is opened by a client from a link
 * and printed to PDF, so everything it needs has to be in the document itself.
 *
 * Colours are fixed rather than themed, for the same reason the rest of the
 * document is.
 *
 * One brand orange, not a ramp. Each chart shows a single series, and the
 * thing being compared is already carried by bar length or dot height — a
 * four-step ramp added no information and its lighter steps fell under 3:1 on
 * white, so the bar for the worst bucket would have been the hardest to see.
 */
const BRAND = "#EA580C";
function dayLabel(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** The subordinate measure. Validated at 4.8:1 on white. */
const QUIET = "#64748B";
const INK = "#1a1a1a";
const MUTED = "#6b7280";
const GRID = "#e5e7eb";

export function PositionChart({ buckets }: { buckets: PositionBucket[] }) {
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  if (!total) return null;
  const max = Math.max(...buckets.map((bucket) => bucket.count));
  const rowHeight = 38;
  const barTop = 12;
  const labelWidth = 148;
  const chartWidth = 420;
  const height = buckets.length * rowHeight + 8;

  return (
    <svg
      viewBox={`0 0 ${labelWidth + chartWidth + 46} ${height}`}
      className="report-chart"
      role="img"
      aria-label="How many keywords sit in each position range"
    >
      {buckets.map((bucket, index) => {
        const y = index * rowHeight;
        const width = max ? (bucket.count / max) * chartWidth : 0;
        return (
          <g key={bucket.label}>
            <text
              x={labelWidth - 12}
              y={y + barTop + 11}
              textAnchor="end"
              fontSize="12"
              fill={MUTED}
            >
              {bucket.label}
            </text>
            <rect
              x={labelWidth}
              y={y + barTop}
              width={chartWidth}
              height="16"
              rx="4"
              fill={GRID}
            />
            {bucket.count ? (
              <rect
                x={labelWidth}
                y={y + barTop}
                width={Math.max(width, 4)}
                height="16"
                rx="4"
                fill={BRAND}
              />
            ) : null}
            <text
              x={labelWidth + Math.max(width, 4) + 10}
              y={y + barTop + 12}
              fontSize="12"
              fontWeight="600"
              fill={INK}
            >
              {bucket.count}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Where each tracked keyword sits, one dot per keyword.
 *
 * Position 1 at the top, because that is how everyone reads a ranking. A dot
 * plot rather than a bar chart: the question is "how many of us are near the
 * top", and thirty bars would answer it worse than thirty dots.
 */
export function RankSpreadChart({ keywords }: { keywords: ReportKeyword[] }) {
  if (!keywords.length) return null;
  const width = 620;
  const height = 200;
  const padTop = 16;
  const padBottom = 28;
  const worst = Math.max(20, ...keywords.map((keyword) => keyword.position));
  const plotHeight = height - padTop - padBottom;
  const yFor = (position: number) =>
    padTop + ((position - 1) / Math.max(worst - 1, 1)) * plotHeight;
  const xStep = keywords.length > 1 ? 560 / (keywords.length - 1) : 0;
  const guides = [1, 3, 10, 20].filter((line) => line <= worst);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="report-chart"
      role="img"
      aria-label="Where each tracked keyword currently sits"
    >
      {guides.map((line) => (
        <g key={line}>
          <line
            x1="42"
            x2={width - 18}
            y1={yFor(line)}
            y2={yFor(line)}
            stroke={GRID}
            strokeWidth="1"
          />
          <text
            x="34"
            y={yFor(line) + 4}
            textAnchor="end"
            fontSize="11"
            fill={MUTED}
          >
            {line}
          </text>
        </g>
      ))}
      {keywords.map((keyword, index) => (
        <circle
          key={keyword.keyword}
          cx={46 + index * xStep}
          cy={yFor(keyword.position)}
          r="5"
          fill={BRAND}
          stroke="#ffffff"
          strokeWidth="2"
        />
      ))}
      <text x="34" y={height - 8} textAnchor="end" fontSize="11" fill={MUTED}>
        pos
      </text>
      <text
        x={width - 18}
        y={height - 8}
        textAnchor="end"
        fontSize="11"
        fill={MUTED}
      >
        each dot is one keyword
      </text>
    </svg>
  );
}

/**
 * Clicks and impressions over the last four weeks.
 *
 * Two measures of very different size, so they are two stacked panels sharing
 * one time axis rather than one chart with two y-scales. A dual axis lets you
 * put any two lines in any relationship you like by choosing the scales, which
 * is exactly why it does not belong in a document a client is asked to trust.
 *
 * Clicks wear the brand orange and impressions a slate, because clicks are the
 * measure that matters and impressions are context. The validator flags the
 * slate as reading grey, which is the intent — each panel carries its own
 * label, so colour is doing hierarchy here, not identity.
 */
export function SearchPerformanceChart({
  performance,
}: {
  performance: SearchPerformance;
}) {
  const days = performance.days;
  if (days.length < 2) return null;

  const width = 620;
  const panel = 74;
  const gap = 26;
  const height = panel * 2 + gap + 22;
  const left = 44;
  const plotWidth = width - left - 14;
  const xFor = (index: number) =>
    left + (index / (days.length - 1)) * plotWidth;

  const series = (
    values: number[],
    top: number,
  ): { line: string; area: string; max: number } => {
    const max = Math.max(...values, 1);
    const yFor = (value: number) => top + panel - (value / max) * (panel - 8);
    const points = values.map(
      (value, index) => `${xFor(index)},${yFor(value)}`,
    );
    return {
      line: `M${points.join("L")}`,
      area: `M${xFor(0)},${top + panel}L${points.join("L")}L${xFor(values.length - 1)},${top + panel}Z`,
      max,
    };
  };

  const impressions = series(
    days.map((day) => day.impressions),
    0,
  );
  const clicks = series(
    days.map((day) => day.clicks),
    panel + gap,
  );
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="report-chart"
      role="img"
      aria-label="Impressions and clicks from Google over the last four weeks"
    >
      <text x="4" y="12" fontSize="11" fill={MUTED} fontWeight="600">
        Impressions
      </text>
      <text x={width - 14} y="12" fontSize="11" fill={MUTED} textAnchor="end">
        peak {impressions.max.toLocaleString()}
      </text>
      <path d={impressions.area} fill="#E7EAEF" />
      <path
        d={impressions.line}
        fill="none"
        stroke={QUIET}
        strokeWidth="2"
        strokeLinejoin="round"
      />

      <text
        x="4"
        y={panel + gap - 6}
        fontSize="11"
        fill={MUTED}
        fontWeight="600"
      >
        Clicks
      </text>
      <text
        x={width - 14}
        y={panel + gap - 6}
        fontSize="11"
        fill={MUTED}
        textAnchor="end"
      >
        peak {clicks.max.toLocaleString()}
      </text>
      <path d={clicks.area} fill="#FBE0CC" />
      <path
        d={clicks.line}
        fill="none"
        stroke={BRAND}
        strokeWidth="2"
        strokeLinejoin="round"
      />

      <line
        x1={left}
        x2={width - 14}
        y1={height - 20}
        y2={height - 20}
        stroke={GRID}
      />
      <text x={left} y={height - 6} fontSize="11" fill={MUTED}>
        {dayLabel(days[0]?.date ?? "")}
      </text>
      <text
        x={width - 14}
        y={height - 6}
        fontSize="11"
        fill={MUTED}
        textAnchor="end"
      >
        {dayLabel(days.at(-1)?.date ?? "")}
      </text>
    </svg>
  );
}

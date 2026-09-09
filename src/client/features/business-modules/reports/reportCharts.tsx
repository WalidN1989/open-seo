import type {
  PositionBucket,
  ReportKeyword,
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

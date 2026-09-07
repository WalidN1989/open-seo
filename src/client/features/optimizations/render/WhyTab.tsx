import {
  formatCtr,
  formatPosition,
  readDateRange,
  readGscRows,
  readSerpResults,
  readText,
  type Json,
} from "./read";

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-base-300 p-3">
      <p className="text-xs uppercase tracking-wide text-base-content/50">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function Prose({ title, body }: { title: string; body: string }) {
  return (
    <section>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-base-content/80">
        {body}
      </p>
    </section>
  );
}

export function WhyTab({
  source,
  score,
  recommendedAction,
  strengths,
  weaknesses,
  gscSnapshot,
  serpSnapshot,
}: {
  source: string;
  score: number;
  recommendedAction: string;
  strengths: string | null;
  weaknesses: string | null;
  gscSnapshot: Json;
  serpSnapshot: Json;
}) {
  const rows = readGscRows(gscSnapshot);
  const results = readSerpResults(serpSnapshot);
  const dateRange = readDateRange(gscSnapshot);
  const property = readText(gscSnapshot, "property", "site");
  const serpNote = readText(serpSnapshot, "note");
  const serpDate = readText(serpSnapshot, "fetchedAt", "date");
  // A ranking chart needs a worst case to scale against; 20 keeps a
  // position-3 bar from filling the row and implying more than it means.
  const worstRank = Math.max(20, ...results.map((item) => item.rank ?? 0));

  return (
    <div className="space-y-7">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card label="Why it surfaced" value={source} />
        <Card label="Opportunity score" value={`${score}/100`} />
        <Card label="Recommended" value={recommendedAction} />
      </div>

      {strengths ? (
        <Prose title="What is already working" body={strengths} />
      ) : null}
      {weaknesses ? (
        <Prose title="What is holding it back" body={weaknesses} />
      ) : null}

      <section>
        <h3 className="text-sm font-semibold">How this search performs today</h3>
        <p className="mt-0.5 text-xs text-base-content/50">
          {property ? `${property}` : "Google Search Console"}
          {dateRange ? ` · ${dateRange}` : ""}
        </p>
        {rows.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Search</th>
                  <th className="text-right">Times shown</th>
                  <th className="text-right">Clicks</th>
                  <th className="text-right">Click rate</th>
                  <th className="text-right">Position</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row.query}-${index}`}>
                    <td className="font-medium">{row.query}</td>
                    <td className="text-right">{row.impressions ?? "—"}</td>
                    <td className="text-right">{row.clicks ?? "—"}</td>
                    <td className="text-right">{formatCtr(row.ctr)}</td>
                    <td className="text-right">{formatPosition(row.position)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-base-content/60">
            No search data was recorded for this opportunity.
          </p>
        )}
      </section>

      <section>
        <h3 className="text-sm font-semibold">Who ranks for this search today</h3>
        {serpDate ? (
          <p className="mt-0.5 text-xs text-base-content/50">
            Checked {serpDate}
          </p>
        ) : null}
        {results.length ? (
          <ol className="mt-3 space-y-2">
            {results.map((result, index) => (
              <li
                key={`${result.url ?? result.domain}-${index}`}
                className="flex items-center gap-3"
              >
                <span className="w-6 shrink-0 text-right text-sm tabular-nums text-base-content/50">
                  {result.rank ?? index + 1}
                </span>
                <span
                  className="h-2 shrink-0 rounded-full bg-primary/25"
                  style={{
                    width: `${Math.max(6, ((worstRank - (result.rank ?? index + 1) + 1) / worstRank) * 100)}px`,
                  }}
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm">
                    {result.title ?? result.domain}
                  </span>
                  {result.domain ? (
                    <span className="block truncate text-xs text-base-content/50">
                      {result.domain}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 text-sm text-base-content/60">
            No competitor results were recorded.
          </p>
        )}
        {serpNote ? (
          <p className="mt-3 text-sm text-base-content/70">{serpNote}</p>
        ) : null}
      </section>
    </div>
  );
}

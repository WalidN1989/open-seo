import type { ReportSnapshot } from "@/server/features/reports/reportSnapshot";
import { ROADMAP, SERVICES } from "@/server/features/reports/reportSnapshot";
import { PositionChart, RankSpreadChart } from "./reportCharts";

function longDate(iso: string | null) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="report-stat">
      <div className="report-stat-value">{value}</div>
      <div className="report-stat-label">{label}</div>
    </div>
  );
}

function Movement({
  keyword,
}: {
  keyword: ReportSnapshot["keywords"][number];
}) {
  if (keyword.previousPosition === null) {
    return <span className="report-move report-move-new">new</span>;
  }
  const change = keyword.previousPosition - keyword.position;
  if (change === 0) return <span className="report-move">—</span>;
  const up = change > 0;
  return (
    <span
      className={`report-move ${up ? "report-move-up" : "report-move-down"}`}
    >
      {up ? "▲" : "▼"} {Math.abs(change)}
    </span>
  );
}

export function ClientReportDocument({
  snapshot,
}: {
  snapshot: ReportSnapshot;
}) {
  const { agency, client, headline } = snapshot;

  return (
    <article className="report-document">
      <header className="report-cover">
        <div className="report-cover-brand">
          {agency.logoUrl ? (
            <img
              src={agency.logoUrl}
              alt={agency.name}
              className="report-logo"
            />
          ) : (
            <span className="report-wordmark">{agency.name}</span>
          )}
        </div>
        <p className="report-eyebrow">Search performance and plan</p>
        <h1 className="report-title">{client.name}</h1>
        <p className="report-subtitle">
          {client.domain ?? client.projectName} · prepared{" "}
          {longDate(snapshot.generatedAt)}
        </p>
      </header>

      <section className="report-section">
        <h2>What we have set up for you</h2>
        <p className="report-lede">
          Everything below is in place and running. It is the measurement layer
          that lets us prove what the work changes, rather than assert it.
        </p>
        <ul className="report-checklist">
          {snapshot.setup.map((item) => (
            <li
              key={item.label}
              className={item.done ? "is-done" : "is-pending"}
            >
              <span className="report-check" aria-hidden="true">
                {item.done ? "✓" : "○"}
              </span>
              <span>
                <strong>{item.label}</strong>
                <span className="report-check-detail">{item.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="report-section">
        <h2>Where you stand today</h2>
        <div className="report-stats">
          <Stat value={headline.trackedKeywords} label="Keywords tracked" />
          <Stat value={headline.topThree} label="In the top 3" />
          <Stat value={headline.firstPage} label="On page one" />
          <Stat
            value={headline.referringDomains ?? "—"}
            label="Websites linking to you"
          />
        </div>
        {snapshot.lastCheckedAt ? (
          <p className="report-note">
            Positions last checked {longDate(snapshot.lastCheckedAt)}.
            {headline.notRanking
              ? ` A further ${headline.notRanking} tracked ${headline.notRanking === 1 ? "keyword is" : "keywords are"} not yet appearing, which is where the next months of work go.`
              : ""}
          </p>
        ) : (
          <p className="report-note">
            Position tracking is set up and the first full check is scheduled.
          </p>
        )}
        <PositionChart buckets={snapshot.buckets} />
      </section>

      {snapshot.keywords.length ? (
        <section className="report-section">
          <h2>Your keywords</h2>
          <RankSpreadChart keywords={snapshot.keywords} />
          <table className="report-table">
            <thead>
              <tr>
                <th>Keyword</th>
                <th className="report-num">Position</th>
                <th className="report-num">Change</th>
                <th className="report-num">Monthly searches</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.keywords.map((keyword) => (
                <tr key={keyword.keyword}>
                  <td>{keyword.keyword}</td>
                  <td className="report-num">{keyword.position}</td>
                  <td className="report-num">
                    <Movement keyword={keyword} />
                  </td>
                  <td className="report-num">{keyword.searchVolume ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {snapshot.competitors.length ? (
        <section className="report-section">
          <h2>Who you are competing with</h2>
          <p className="report-lede">
            These are the sites holding the positions we want. Our content and
            link work is aimed at the gaps between their pages and yours.
          </p>
          <ul className="report-competitors">
            {snapshot.competitors.map((competitor) => (
              <li key={competitor.domain}>
                <strong>{competitor.name || competitor.domain}</strong>
                {competitor.name ? <span>{competitor.domain}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {snapshot.siteHealth ? (
        <section className="report-section">
          <h2>Technical health</h2>
          <p className="report-lede">
            We crawled {snapshot.siteHealth.pagesCrawled} pages of your site.
            Fixing what this found is part of the first month.
          </p>
          <ul className="report-issues">
            {snapshot.siteHealth.issues.map((issue) => (
              <li key={issue.severity}>
                <span className="report-issue-count">{issue.count}</span>
                <span>{issue.severity}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="report-section report-section-break">
        <h2>What happens next</h2>
        <p className="report-lede">
          Search results are earned, not bought, and the compounding takes
          months rather than weeks. This is the shape of the work, and when each
          part typically starts to show.
        </p>
        <ol className="report-roadmap">
          {ROADMAP.map((phase) => (
            <li key={phase.phase}>
              <div className="report-phase">{phase.phase}</div>
              <div>
                <strong>{phase.title}</strong>
                <p>{phase.detail}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="report-callout">
          We ask for three months to lay the groundwork, and recommend six to
          see it compound. Judging the work before then measures the setup, not
          the results.
        </p>
      </section>

      <section className="report-section">
        <h2>What your engagement includes</h2>
        <ul className="report-services">
          {SERVICES.map((service) => (
            <li key={service}>{service}</li>
          ))}
        </ul>
      </section>

      <footer className="report-footer">
        <div>
          <strong>{agency.name}</strong>
          {agency.addressLines
            ? agency.addressLines
                .split("\n")
                .filter((line) => line.trim())
                .map((line) => <div key={line}>{line}</div>)
            : null}
        </div>
        <div className="report-footer-contact">
          {agency.email ? <div>{agency.email}</div> : null}
          {agency.phone ? <div>{agency.phone}</div> : null}
          {agency.website ? <div>{agency.website}</div> : null}
        </div>
      </footer>
    </article>
  );
}

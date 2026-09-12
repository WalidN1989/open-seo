import type { ReportSnapshot } from "@/server/features/reports/reportSnapshot";
import { ROADMAP } from "@/server/features/reports/reportSnapshot";
import {
  PositionChart,
  RankSpreadChart,
  SearchPerformanceChart,
} from "./reportCharts";
import {
  CollectReviews,
  CompetitorsToConfirm,
  Conclusion,
  KeywordsToConfirm,
  Recommendations,
} from "./ConfirmSections";

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

/**
 * Meta hands back the WhatsApp number unspaced. Grouped is easier to read off
 * a printed page; anything that is not a plain twelve-digit international
 * number is left exactly as it was given.
 */
function readableNumber(number: string) {
  const match = /^\+(\d{2})(\d{3})(\d{3})(\d{3})$/.exec(number.trim());
  return match ? `+${match[1]} ${match[2]} ${match[3]} ${match[4]}` : number;
}

/** A bare domain in settings still has to be clickable in the document. */
function websiteHref(website: string) {
  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
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

function ReportFooter({ agency }: { agency: ReportSnapshot["agency"] }) {
  return (
    <footer className="report-footer">
      <div className="report-footer-identity">
        <strong>{agency.name}</strong>
        {agency.addressLines
          ? agency.addressLines
              .split("\n")
              .filter((line) => line.trim())
              .map((line) => <div key={line}>{line}</div>)
          : null}
        {agency.taxIdValue ? (
          <div className="report-footer-registration">
            {agency.taxIdLabel ?? "ABN"} {agency.taxIdValue}
          </div>
        ) : null}
      </div>
      <div className="report-footer-contact">
        {agency.website ? (
          <div>
            <a className="report-link" href={websiteHref(agency.website)}>
              {agency.website.replace(/^https?:\/\//, "")}
            </a>
          </div>
        ) : null}
        {agency.phone ? <div>{agency.phone}</div> : null}
        {agency.email ? <div>{agency.email}</div> : null}
      </div>
      {agency.whatsappNumber ? (
        <p className="report-footer-note">
          Any concerns? Message us on WhatsApp,{" "}
          {readableNumber(agency.whatsappNumber)}.
        </p>
      ) : null}
    </footer>
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
      {/*
        The browser's own print dialog rather than a rendered PDF. It is one
        button, it needs no renderer in the bundle, and the page was laid out
        for paper from the start — @media print already hides everything else
        and breaks the plan onto its own page.
      */}
      <div className="report-actions print:hidden">
        <button
          type="button"
          className="report-download"
          onClick={() => window.print()}
        >
          Download as PDF
        </button>
      </div>
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
                <span className="report-check-detail">
                  {item.url ? (
                    <>
                      <a className="report-link" href={item.url}>
                        {item.url.replace(/^https?:\/\/(www\.)?/, "")}
                      </a>
                      {" · "}
                    </>
                  ) : null}
                  {item.detail}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <Recommendations text={snapshot.recommendations} />

      <CollectReviews url={snapshot.googleReviewUrl} />

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

      {snapshot.searchPerformance ? (
        <section className="report-section">
          <h2>How you show up in Google</h2>
          <p className="report-lede">
            Straight from Google Search Console, for the four weeks to{" "}
            {longDate(snapshot.searchPerformance.endDate)}. Impressions are how
            often you appeared; clicks are how often someone chose you.
          </p>
          <div className="report-stats">
            <Stat
              value={snapshot.searchPerformance.clicks.toLocaleString()}
              label="Clicks"
            />
            <Stat
              value={snapshot.searchPerformance.impressions.toLocaleString()}
              label="Impressions"
            />
            <Stat
              value={`${(snapshot.searchPerformance.ctr * 100).toFixed(1)}%`}
              label="Click-through rate"
            />
            <Stat
              value={snapshot.searchPerformance.averagePosition.toFixed(1)}
              label="Average position"
            />
          </div>
          <SearchPerformanceChart performance={snapshot.searchPerformance} />
          {snapshot.searchPerformance.topQueries.length ? (
            <table className="report-table">
              <thead>
                <tr>
                  <th>What people searched</th>
                  <th className="report-num">Clicks</th>
                  <th className="report-num">Impressions</th>
                  <th className="report-num">Avg position</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.searchPerformance.topQueries.map((query) => (
                  <tr key={query.query}>
                    <td>{query.query}</td>
                    <td className="report-num">
                      {query.clicks.toLocaleString()}
                    </td>
                    <td className="report-num">
                      {query.impressions.toLocaleString()}
                    </td>
                    <td className="report-num">{query.position.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </section>
      ) : null}

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

      <KeywordsToConfirm rows={snapshot.keywordsToConfirm} />

      <CompetitorsToConfirm snapshot={snapshot} />

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
          {snapshot.included.map((service) => (
            <li
              key={service.label}
              className={service.active ? "is-active" : "is-planned"}
            >
              <span className="report-service-mark" aria-hidden="true">
                {service.active ? "✓" : "○"}
              </span>
              <span>
                <strong>{service.label}</strong>
                <span className="report-service-detail">{service.detail}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="report-note">
          A tick means it is running for you now. The rest are part of the
          engagement and start as the plan above reaches them.
        </p>
      </section>

      {snapshot.access ? (
        <section className="report-section">
          <h2>Your dashboard</h2>
          <p className="report-lede">
            Everything in this report stays live here. Sign in any time to see
            your positions, traffic and the work in progress.
          </p>
          <div className="report-access">
            <div>
              <span className="report-access-label">Address</span>
              <a
                className="report-access-value report-link"
                href={snapshot.access.url}
              >
                {snapshot.access.url}
              </a>
            </div>
            {snapshot.access.loginEmail ? (
              <div>
                <span className="report-access-label">Sign in with</span>
                <span className="report-access-value">
                  {snapshot.access.loginEmail}
                </span>
              </div>
            ) : null}
            <div>
              <span className="report-access-label">Password</span>
              <span className="report-access-value report-access-muted">
                Sent to you separately, never in a document
                {agency.phone ? (
                  <> — call us on {agency.phone} if you need it again</>
                ) : null}
              </span>
            </div>
          </div>
        </section>
      ) : null}

      <Conclusion text={snapshot.conclusion} />

      <ReportFooter agency={agency} />
    </article>
  );
}

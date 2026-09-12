import type { ReportSnapshot } from "@/server/features/reports/reportSnapshot";

/**
 * The parts of the report that ask the client for something back.
 *
 * Both print with an empty square beside each row. The document goes out as a
 * PDF, the client marks it with a pen, and what comes back is the shortlist.
 * A checkbox input would print as whatever the browser felt like.
 */

export function Recommendations({ text }: { text: string | null }) {
  if (!text?.trim()) return null;
  return (
    <section className="report-section">
      <h2>Our recommendations</h2>
      <PastedText text={text} />
    </section>
  );
}

export function KeywordsToConfirm({
  rows,
}: {
  rows: ReportSnapshot["keywordsToConfirm"];
}) {
  if (!rows.length) return null;
  return (
    <section className="report-section">
      <h2>Keywords for you to confirm</h2>
      <p className="report-lede">
        These are the searches with the most people behind them among what we
        have researched for you. You know your business better than the numbers
        do: tick the ones that bring the right customers, cross out the ones
        that do not, and tell us anything we have missed.
      </p>
      <table className="report-table report-table-confirm">
        <thead>
          <tr>
            <th className="report-tick-head" aria-label="Tick" />
            <th>Keyword</th>
            <th className="report-num">Monthly searches</th>
            <th className="report-num">Difficulty</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.keyword}>
              <td>
                <span className="report-tick" aria-hidden="true" />
              </td>
              <td>{row.keyword}</td>
              <td className="report-num">
                {row.searchVolume?.toLocaleString() ?? "—"}
              </td>
              <td className="report-num">{row.difficulty ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function CompetitorsToConfirm({
  snapshot,
}: {
  snapshot: ReportSnapshot;
}) {
  if (!snapshot.competitors.length) return null;
  return (
    <section className="report-section">
      <h2>Who you are competing with</h2>
      <p className="report-lede">
        {snapshot.competitorsFromSearch
          ? "These came out of the searches your customers actually run — the sites we keep meeting on the results page. Our content and link work is aimed at the gaps between their pages and yours."
          : "These are the sites holding the positions we want. Our content and link work is aimed at the gaps between their pages and yours."}
      </p>
      <ul className="report-competitors">
        {snapshot.competitors.map((competitor) => (
          <li key={competitor.domain} className="report-competitor-confirm">
            <span className="report-tick" aria-hidden="true" />
            <span>
              <strong>{competitor.name || competitor.domain}</strong>
              {competitor.name ? (
                <span className="report-competitor-domain">
                  {competitor.domain}
                </span>
              ) : null}
              {competitor.keywords ? (
                <span className="report-competitor-domain">
                  Appears for {competitor.keywords} of your keywords, best
                  position {competitor.bestRank}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      <p className="report-note">
        Tick the ones you consider real competitors. If none of these are right,
        tell us who you are actually up against and we will build the list from
        there.
      </p>
    </section>
  );
}

/**
 * Asking customers for reviews, made one tap.
 *
 * Three cards, one per place a small business actually talks to customers.
 * Each carries a ready-written message with the review link inside it, so the
 * client forwards it rather than composing it. The Facebook card is a plain
 * share link, since that is all Facebook allows from outside.
 */
export function CollectReviews({ url }: { url: string | null }) {
  if (!url) return null;
  const message =
    "Thank you for choosing us. Would you leave us a quick Google review? It helps other people find us. " +
    url;
  const cards = [
    {
      label: "WhatsApp",
      href: `https://wa.me/?text=${encodeURIComponent(message)}`,
      hint: "Send to a customer",
    },
    {
      label: "Email",
      href: `mailto:?subject=${encodeURIComponent("Would you leave us a review?")}&body=${encodeURIComponent(message)}`,
      hint: "Open a ready-written email",
    },
    {
      label: "Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
      hint: "Share to your page",
    },
  ];
  return (
    <section className="report-section">
      <h2>Collecting Google reviews</h2>
      <p className="report-lede">
        Reviews are what put a business in the map results, and the businesses
        that win there simply ask more often. This is your review link, ready to
        send three ways.
      </p>
      <div className="report-share">
        {cards.map((card) => (
          <a key={card.label} className="report-share-card" href={card.href}>
            <strong>{card.label}</strong>
            <span>{card.hint}</span>
          </a>
        ))}
      </div>
      <p className="report-note">
        Your link:{" "}
        <a className="report-link" href={url}>
          {url}
        </a>
      </p>
      <p className="report-note">
        Use whichever your customers use, and send it to new customers
        especially. Ask them to describe the service they had rather than just
        leaving stars — Google reads the words, and that is what makes you show
        up when someone searches for that service.
      </p>
    </section>
  );
}

/**
 * Light formatting for pasted text.
 *
 * Just enough for what an agent's summary contains: blank lines make
 * paragraphs, lines starting with "- " make a list, and **bold** is bold.
 * Deliberately not a Markdown renderer — a client document is not the place
 * to discover what a stray underscore does.
 */
function inline(text: string, keyPrefix: string) {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, index) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={`${keyPrefix}-${index}`}>{part.slice(2, -2)}</strong>
      ) : (
        <span key={`${keyPrefix}-${index}`}>{part}</span>
      ),
    );
}

export function PastedText({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).filter((block) => block.trim());
  return (
    <div className="report-prose">
      {blocks.map((block, blockIndex) => {
        const lines = block.split("\n");
        const isList = lines.every((line) => /^\s*[-•]\s+/.test(line));
        if (isList) {
          return (
            <ul key={blockIndex}>
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>
                  {inline(
                    line.replace(/^\s*[-•]\s+/, ""),
                    `${blockIndex}-${lineIndex}`,
                  )}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={blockIndex}>{inline(lines.join(" "), `${blockIndex}`)}</p>
        );
      })}
    </div>
  );
}

export function Conclusion({ text }: { text: string | null }) {
  if (!text?.trim()) return null;
  return (
    <section className="report-section">
      <h2>Conclusion</h2>
      <PastedText text={text} />
    </section>
  );
}

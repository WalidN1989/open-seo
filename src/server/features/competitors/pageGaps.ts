import { isCompetitorDomain } from "./rankCompetitors";

/**
 * Where rivals have built a page for something and this site has not.
 *
 * The whole analysis turns on one distinction that is readable straight off a
 * URL: a competitor ranking with "/" has not committed to that search, while
 * one ranking with "/colorbond-fencing-brisbane/" has. When several have
 * committed and we are answering with the homepage, the homepage is being
 * asked to serve intents that the market has already split apart — and Google
 * will only pick one of them.
 *
 * Free of database imports so the rule can be tested on its own.
 */

export type PageObservation = {
  keyword: string;
  domain: string;
  rank: number;
  url: string | null;
  title: string | null;
};

export type CompetitorPage = {
  domain: string;
  url: string;
  title: string | null;
  rank: number;
  dedicated: boolean;
};

export type PageGap = {
  keyword: string;
  /** Rivals answering with a page built for this search. */
  dedicated: CompetitorPage[];
  /** Our own best result, when we appear at all. */
  ours: { url: string; rank: number; dedicated: boolean } | null;
};

/**
 * Whether a URL is a page built for one thing.
 *
 * The homepage is the "no" case, and so is a bare category index — those are
 * hubs, not answers. Anything with a path segment counts.
 */
export function isDedicatedPage(url: string | null): boolean {
  if (!url) return false;
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    // A stored value that is not a full URL: treat the whole thing as a path.
    path = url.startsWith("/") ? url : `/${url}`;
  }
  const trimmed = path.replace(/\/+$/, "");
  return trimmed !== "" && trimmed !== "/index.html" && trimmed !== "/home";
}

function best<T extends { rank: number }>(rows: T[]): T | null {
  return rows.length
    ? rows.reduce((winner, row) => (row.rank < winner.rank ? row : winner))
    : null;
}

/** Every competitor page seen, grouped by the domain that owns it. */
export function pagesByCompetitor(
  observations: PageObservation[],
  ownDomain: string | null,
) {
  type Tally = CompetitorPage & { keywords: Set<string> };
  const byDomain = new Map<string, Map<string, Tally>>();
  for (const row of observations) {
    if (!row.url) continue;
    if (!isCompetitorDomain(row.domain, ownDomain)) continue;
    const pages: Map<string, Tally> =
      byDomain.get(row.domain) ?? new Map<string, Tally>();
    const existing = pages.get(row.url);
    if (existing) {
      existing.keywords.add(row.keyword);
      if (row.rank < existing.rank) existing.rank = row.rank;
    } else {
      pages.set(row.url, {
        domain: row.domain,
        url: row.url,
        title: row.title,
        rank: row.rank,
        dedicated: isDedicatedPage(row.url),
        keywords: new Set([row.keyword]),
      });
    }
    byDomain.set(row.domain, pages);
  }

  return [...byDomain.entries()]
    .map(([domain, pages]) => ({
      domain,
      pages: [...pages.values()]
        .map((page) => ({
          url: page.url,
          title: page.title,
          rank: page.rank,
          dedicated: page.dedicated,
          keywords: [...page.keywords].toSorted((a, b) => a.localeCompare(b)),
        }))
        .toSorted((a, b) => a.rank - b.rank),
    }))
    .toSorted(
      (a, b) =>
        b.pages.filter((page) => page.dedicated).length -
        a.pages.filter((page) => page.dedicated).length,
    );
}

/**
 * The searches worth building a page for.
 *
 * A gap needs at least `minRivals` competitors answering with a page of their
 * own. One rival with a landing page is a preference; several is the shape the
 * market has settled on.
 */
export function findPageGaps(
  observations: PageObservation[],
  options: { ownDomain: string | null; minRivals?: number },
): PageGap[] {
  const minRivals = options.minRivals ?? 2;
  const own = options.ownDomain?.toLowerCase().replace(/^www\./, "") ?? null;
  const byKeyword = new Map<string, PageObservation[]>();
  for (const row of observations) {
    const list = byKeyword.get(row.keyword);
    if (list) list.push(row);
    else byKeyword.set(row.keyword, [row]);
  }

  const gaps: PageGap[] = [];
  for (const [keyword, rows] of byKeyword) {
    const dedicated = new Map<string, CompetitorPage>();
    for (const row of rows) {
      if (!row.url || !isCompetitorDomain(row.domain, own)) continue;
      if (!isDedicatedPage(row.url)) continue;
      // One page per rival: three URLs from the same site is still one rival
      // who decided this search deserves its own page.
      const held = dedicated.get(row.domain);
      if (!held || row.rank < held.rank) {
        dedicated.set(row.domain, {
          domain: row.domain,
          url: row.url,
          title: row.title,
          rank: row.rank,
          dedicated: true,
        });
      }
    }
    if (dedicated.size < minRivals) continue;

    const mine = own
      ? rows.filter(
          (row) => row.domain.toLowerCase().replace(/^www\./, "") === own,
        )
      : [];
    const ourBest = best(mine);
    // Already answering with a page of our own: not a gap.
    if (ourBest?.url && isDedicatedPage(ourBest.url)) continue;

    gaps.push({
      keyword,
      dedicated: [...dedicated.values()].toSorted((a, b) => a.rank - b.rank),
      ours: ourBest?.url
        ? { url: ourBest.url, rank: ourBest.rank, dedicated: false }
        : null,
    });
  }

  // Most rivals committed first: that is the strongest evidence, and where a
  // homepage is being asked to do the most work.
  return gaps.toSorted(
    (a, b) =>
      b.dedicated.length - a.dedicated.length ||
      a.keyword.localeCompare(b.keyword),
  );
}

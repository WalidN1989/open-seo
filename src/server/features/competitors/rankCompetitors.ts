/**
 * Turning SERP positions into a list of competitors.
 *
 * Free of database imports: which domains count as rivals, and how they are
 * ordered, is a judgement worth being able to test on its own.
 */

export type Observation = {
  keyword: string;
  domain: string;
  rank: number;
  referringDomains: number | null;
};

export type Competitor = {
  domain: string;
  /** How many of this project's keywords the domain appears for. */
  keywords: number;
  /** Its best position across them. */
  bestRank: number;
  averageRank: number;
  referringDomains: number | null;
  /** The keywords it beat us on, for the report to name. */
  examples: string[];
};

/**
 * Domains that rank for commercial terms without competing for the work.
 *
 * Encyclopaedias, governments, job boards, directories and marketplaces all
 * outrank a local trade for its own category words, and putting them in front
 * of a client as "your competitors" would make the whole report look automated
 * and wrong. Matched on the registrable suffix or a whole label, so
 * "seek.com.au" is excluded and "deckseek.com.au" is not.
 */
const NOT_COMPETITORS = [
  "wikipedia.org",
  "reddit.com",
  "quora.com",
  "youtube.com",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "pinterest.com",
  "tiktok.com",
  "x.com",
  "twitter.com",
  "amazon.com",
  "ebay.com",
  "etsy.com",
  // Both forms: Google returned "au.seek.com" for a Brisbane trade query,
  // which the .com.au entry alone did not catch.
  "seek.com",
  "seek.com.au",
  "indeed.com",
  "jora.com",
  "gumtree.com.au",
  "yellowpages.com.au",
  "truelocal.com.au",
  "yelp.com",
  "hipages.com.au",
  "oneflare.com.au",
  "airtasker.com",
  "productreview.com.au",
  "houzz.com",
  "houzz.com.au",
  "tripadvisor.com",
  "abs.gov.au",
  "business.gov.au",
  "standards.org.au",
  "ibisworld.com",
];

const GOVERNMENT = /(^|\.)(gov|gov\.[a-z]{2}|edu|edu\.[a-z]{2})(\.[a-z]{2})?$/i;

function normalizeDomain(domain: string) {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
}

export function isCompetitorDomain(domain: string, ownDomain: string | null) {
  const candidate = normalizeDomain(domain);
  if (!candidate || candidate.includes(" ")) return false;
  if (ownDomain && candidate === normalizeDomain(ownDomain)) return false;
  if (GOVERNMENT.test(candidate)) return false;
  return !NOT_COMPETITORS.some(
    (excluded) => candidate === excluded || candidate.endsWith(`.${excluded}`),
  );
}

/**
 * The domains a project competes with, most often-seen first.
 *
 * Ordered by how many of the project's keywords a domain shows up for, not by
 * its best position. Somebody who ranks once at number one is a passer-by;
 * somebody who ranks for two thirds of the list is the competition.
 */
export function rankCompetitors(
  observations: Observation[],
  options: { ownDomain: string | null; limit?: number; minKeywords?: number },
): Competitor[] {
  const byDomain = new Map<string, Observation[]>();
  for (const observation of observations) {
    if (!isCompetitorDomain(observation.domain, options.ownDomain)) continue;
    const domain = normalizeDomain(observation.domain);
    const list = byDomain.get(domain);
    if (list) list.push(observation);
    else byDomain.set(domain, [observation]);
  }

  const minKeywords = options.minKeywords ?? 1;
  const competitors: Competitor[] = [];
  for (const [domain, rows] of byDomain) {
    const keywords = new Set(rows.map((row) => row.keyword));
    if (keywords.size < minKeywords) continue;
    const ranks = rows.map((row) => row.rank);
    const authority = rows
      .map((row) => row.referringDomains)
      .filter((value): value is number => typeof value === "number");
    competitors.push({
      domain,
      keywords: keywords.size,
      bestRank: Math.min(...ranks),
      averageRank:
        Math.round(
          (ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length) * 10,
        ) / 10,
      referringDomains: authority.length ? Math.max(...authority) : null,
      examples: [...keywords]
        .toSorted((a, b) => a.localeCompare(b))
        .slice(0, 3),
    });
  }

  return competitors
    .toSorted(
      (a, b) => b.keywords - a.keywords || a.averageRank - b.averageRank,
    )
    .slice(0, options.limit ?? 8);
}

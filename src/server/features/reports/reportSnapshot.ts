/**
 * The shape of a handover report, and the pure work of building one.
 *
 * Free of database and network imports, so every judgement the document makes
 * — which bucket a position falls in, what counts as movement, what the plan
 * says — can be tested on its own.
 */

export type PositionBucket = {
  label: string;
  count: number;
  /** Ordered best to worst, for the ramp the chart uses. */
  rank: number;
};

export type ReportKeyword = {
  keyword: string;
  position: number;
  previousPosition: number | null;
  searchVolume: number | null;
};

export type SearchPerformance = {
  clicks: number;
  impressions: number;
  /** A fraction, not a percentage. */
  ctr: number;
  averagePosition: number;
  /** Daily, oldest first, for the trend chart. */
  days: Array<{ date: string; clicks: number; impressions: number }>;
  topQueries: Array<{
    query: string;
    clicks: number;
    impressions: number;
    position: number;
  }>;
  startDate: string;
  endDate: string;
};

export type ReportSnapshot = {
  version: 1;
  generatedAt: string;
  agency: {
    name: string;
    logoUrl: string | null;
    email: string | null;
    phone: string | null;
    website: string | null;
    addressLines: string | null;
    /** "ABN", and whatever the business registered under it. */
    taxIdLabel: string | null;
    taxIdValue: string | null;
    /**
     * The number the assistant answers on. Shown so a client with a question
     * has somewhere obvious to put it, since the report itself cannot answer.
     */
    whatsappNumber: string | null;
  };
  client: {
    name: string;
    projectName: string;
    domain: string | null;
    startedAt: string | null;
  };
  setup: Array<{
    label: string;
    done: boolean;
    detail: string;
    /** A profile we can point at, e.g. their Facebook page. */
    url?: string | null;
    /** Whether we run it for them, when that is a question worth answering. */
    managed?: boolean | null;
  }>;
  headline: {
    trackedKeywords: number;
    topThree: number;
    firstPage: number;
    /** Checked, but not found anywhere in the results we look at. */
    notRanking: number;
    referringDomains: number | null;
    backlinks: number | null;
  };
  buckets: PositionBucket[];
  keywords: ReportKeyword[];
  movers: { up: ReportKeyword[]; down: ReportKeyword[] };
  competitors: Array<{
    domain: string;
    name: string | null;
    /** Present when the domain was observed on the client's own SERPs. */
    keywords?: number;
    bestRank?: number;
    examples?: string[];
  }>;
  /** True when the list came from search results rather than being typed in. */
  competitorsFromSearch: boolean;
  siteHealth: {
    pagesCrawled: number;
    issues: Array<{ severity: string; count: number }>;
  } | null;
  content: Array<{ label: string; count: number }>;
  lastCheckedAt: string | null;
  /** Live from Search Console when connected, otherwise absent. */
  searchPerformance: SearchPerformance | null;
  /** Where the client signs in. Never a password — see the service. */
  access: { url: string; loginEmail: string | null } | null;
  /** Only the services actually set up for them are ticked. */
  included: Array<{ label: string; detail: string; active: boolean }>;
  /** What we think they should do, in our words. Free text, may be empty. */
  recommendations: string | null;
  /**
   * Their Google review link, for the client to hand to customers. The
   * report renders it as three share cards — WhatsApp, email, Facebook — so
   * asking for a review is one tap rather than a copied address.
   */
  googleReviewUrl: string | null;
  /**
   * The best of what has been researched, for the client to confirm. Printed
   * with a box beside each so it can be ticked on paper and sent back.
   */
  keywordsToConfirm: Array<{
    keyword: string;
    searchVolume: number | null;
    difficulty: number | null;
  }>;
};

/**
 * Where a position sits.
 *
 * The breaks are the ones that matter commercially rather than round numbers:
 * the top three take most of the clicks, page one is the threshold for being
 * found at all, and everything past twenty is work still to do.
 */
export function bucketFor(position: number): number {
  if (position <= 3) return 0;
  if (position <= 10) return 1;
  if (position <= 20) return 2;
  return 3;
}

const BUCKET_LABELS = [
  "Top 3",
  "Positions 4 to 10",
  "Positions 11 to 20",
  "Beyond 20",
];

export function bucketsFor(keywords: ReportKeyword[]): PositionBucket[] {
  const counts = [0, 0, 0, 0];
  for (const keyword of keywords) {
    counts[bucketFor(keyword.position)] += 1;
  }
  return BUCKET_LABELS.map((label, rank) => ({
    label,
    rank,
    count: counts[rank] ?? 0,
  }));
}

/**
 * Which keywords moved, best first.
 *
 * A lower position number is a better position, so an improvement is the
 * previous number minus the current one. Keywords with no previous check are
 * not movement — they are simply new, and claiming they "improved" would be
 * the report's first lie.
 */
export function moversFor(keywords: ReportKeyword[]) {
  const changed = keywords
    .filter((keyword) => keyword.previousPosition !== null)
    .map((keyword) => ({
      keyword,
      change: (keyword.previousPosition ?? 0) - keyword.position,
    }));
  const up = changed
    .filter((entry) => entry.change > 0)
    .toSorted((a, b) => b.change - a.change)
    .slice(0, 5)
    .map((entry) => entry.keyword);
  const down = changed
    .filter((entry) => entry.change < 0)
    .toSorted((a, b) => a.change - b.change)
    .slice(0, 5)
    .map((entry) => entry.keyword);
  return { up, down };
}

export function headlineFor(
  keywords: ReportKeyword[],
  links: { referringDomains: number | null; backlinks: number | null } | null,
  notRanking = 0,
) {
  return {
    trackedKeywords: keywords.length + notRanking,
    notRanking,
    topThree: keywords.filter((keyword) => keyword.position <= 3).length,
    firstPage: keywords.filter((keyword) => keyword.position <= 10).length,
    referringDomains: links?.referringDomains ?? null,
    backlinks: links?.backlinks ?? null,
  };
}

/**
 * What the next six months look like.
 *
 * Deliberately a plan of work and not a projection of numbers. We have at most
 * a couple of rank checks to extrapolate from, so any traffic curve here would
 * be invented, and a client who is shown an invented curve will hold us to it.
 * Saying what we will do, and when it typically starts to show, is both more
 * honest and more reassuring.
 */
export const ROADMAP = [
  {
    phase: "Month 1",
    title: "Foundations",
    detail:
      "Technical fixes, page structure, and the tracking that lets us prove what changes. Little movement yet — this is the groundwork everything else stands on.",
  },
  {
    phase: "Months 2 to 3",
    title: "Content and authority",
    detail:
      "Blog and page content against your researched keywords, internal linking, and the first links from other sites. Early positions begin to move.",
  },
  {
    phase: "Months 4 to 6",
    title: "Compounding",
    detail:
      "The content published earlier matures and starts ranking, competitor gaps are targeted directly, and the gains build on each other.",
  },
] as const;

/**
 * What the engagement covers.
 *
 * Each line says what it is rather than naming it, because a client reading
 * "digital PR" learns nothing. `active` is set by the service from what is
 * actually connected, so a tick means it is running, not that it is on a price
 * list.
 */
export const SERVICE_CATALOGUE = [
  {
    key: "keywords",
    label: "Keyword research and mapping",
    detail:
      "Finding what your customers actually type, and which page answers it.",
  },
  {
    key: "content",
    label: "Blog and landing page writing",
    detail:
      "Written against those keywords, reviewed by us before anything is published.",
  },
  {
    key: "competitors",
    label: "Competitor analysis",
    detail: "Who holds the positions we want, and where the gap is.",
  },
  {
    key: "audit",
    label: "Technical site audits and fixes",
    detail: "Crawling the site for what stops Google reading it properly.",
  },
  {
    key: "links",
    label: "Link building and digital PR",
    detail:
      "Earning links from other sites, which is what moves competitive terms.",
  },
  {
    key: "gbp",
    label: "Google Business Profile",
    detail:
      "Your map listing kept current, with review collection so new customers see recent ones.",
  },
  {
    key: "whatsapp",
    label: "WhatsApp assistant and automation",
    detail:
      "Enquiries answered around the clock, and handed to your team when they need a person.",
  },
  {
    key: "reporting",
    label: "Search Console and Analytics reporting",
    detail:
      "Your own dashboard, plus a monthly review of what changed and why.",
  },
] as const;

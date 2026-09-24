/**
 * What the voice analyst knows about one project, written as plain text for
 * the model to read before it speaks.
 *
 * Everything here is already stored — the last audit, tracked rankings, the
 * backlink snapshot and the SERPs recorded while researching. Nothing is
 * bought to answer a spoken question: a voice turn has seconds, not the
 * minute a paid lookup takes, and a question should never cost money silently.
 *
 * Counts are worked out here rather than left to the model, because a model
 * handed 400 audit rows will round, and "12 pages have no H1" has to be 12.
 */

export type BriefIssue = {
  issueType: string;
  severity: "critical" | "warning" | "info";
  pageUrl: string;
};

export type BriefRanking = {
  keyword: string;
  searchVolume: number | null;
  position: number | null;
  previousPosition: number | null;
};

export type BriefSerpRow = {
  keyword: string;
  domain: string;
  rank: number;
  url: string | null;
};

export type SeoBriefInput = {
  project: { name: string; domain: string | null };
  competitors: { domain: string; name: string | null }[];
  audit: {
    finishedAt: string | null;
    pagesCrawled: number;
    pageUrls: string[];
    issues: BriefIssue[];
  } | null;
  rankings: BriefRanking[];
  backlinks: {
    capturedAt: string;
    referringDomains: number | null;
    backlinks: number | null;
    newReferringDomains: number | null;
    lostReferringDomains: number | null;
  } | null;
  serp: BriefSerpRow[];
};

/** Plain words for the audit's issue ids, so they can be said out loud. */
const ISSUE_WORDS: Record<string, string> = {
  "missing-h1": "no H1 heading",
  "multiple-h1": "more than one H1 heading",
  "heading-order-skip": "headings that skip a level",
  "missing-title": "no page title",
  "title-too-long": "a title that is too long",
  "title-too-short": "a title that is too short",
  "duplicate-title": "a title shared with another page",
  "missing-meta-description": "no meta description",
  "meta-description-too-long": "a meta description that is too long",
  "meta-description-too-short": "a meta description that is too short",
  "duplicate-meta-description": "a meta description shared with another page",
  "images-missing-alt": "images without alt text",
  "thin-content": "very little text",
  "duplicate-content": "content duplicated elsewhere on the site",
  "broken-page": "a broken response",
  "server-error": "a server error",
  "slow-response": "a slow response",
  "noindex-page": "a noindex tag keeping it out of Google",
  "blocked-page": "crawling blocked",
  "canonical-conflict": "conflicting canonical tags",
  "no-outgoing-links": "no links to other pages",
  "deep-page": "a position too many clicks from the home page",
  "redirect-chain": "a chain of redirects",
  "redirect-loop": "a redirect loop",
};

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 } as const;

/** Paths that mean the site publishes articles, not only products or services. */
const CONTENT_PATH =
  /\/(blog|blogs|news|articles?|journal|posts?|guides?|stories)(\/|$)/i;

function hostOf(value: string | null) {
  if (!value) return "";
  return (
    value
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0] ?? ""
  );
}

function pathOf(url: string) {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function day(value: string | null) {
  return value ? value.slice(0, 10) : "unknown date";
}

function auditLines(audit: NonNullable<SeoBriefInput["audit"]>) {
  const lines = [
    `Last site audit: ${day(audit.finishedAt)}, ${audit.pagesCrawled} pages crawled.`,
  ];
  const groups = new Map<
    string,
    { severity: BriefIssue["severity"]; pages: string[] }
  >();
  for (const issue of audit.issues) {
    const group = groups.get(issue.issueType) ?? {
      severity: issue.severity,
      pages: [],
    };
    group.pages.push(issue.pageUrl);
    groups.set(issue.issueType, group);
  }
  const ranked = [...groups.entries()].toSorted(
    ([, a], [, b]) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      b.pages.length - a.pages.length,
  );
  if (ranked.length === 0) lines.push("The audit found no issues.");
  for (const [type, group] of ranked.slice(0, 10)) {
    const examples = group.pages.slice(0, 3).map(pathOf).join(", ");
    lines.push(
      `- ${group.severity}: ${group.pages.length} page${group.pages.length === 1 ? "" : "s"} with ${ISSUE_WORDS[type] ?? type} (e.g. ${examples})`,
    );
  }
  const articles = audit.pageUrls.filter((url) =>
    CONTENT_PATH.test(pathOf(url)),
  );
  lines.push(
    articles.length > 0
      ? `Blog or article pages found: ${articles.length} (e.g. ${articles.slice(0, 2).map(pathOf).join(", ")}).`
      : `No blog, news or article pages among the ${audit.pageUrls.length} pages the audit crawled.`,
  );
  return lines;
}

function rankingLines(rankings: BriefRanking[]) {
  if (rankings.length === 0) return ["No keywords are being rank-tracked."];
  const byVolume = rankings.toSorted(
    (a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0),
  );
  const ranked = rankings.filter((row) => row.position !== null);
  const lines = [
    `Tracked keywords: ${rankings.length}; ranking in the top 10 for ${ranked.filter((row) => (row.position ?? 99) <= 10).length}, not in the top 100 for ${rankings.length - ranked.length}.`,
  ];
  for (const row of byVolume.slice(0, 12)) {
    const now = row.position === null ? "not ranking" : `#${row.position}`;
    const before =
      row.previousPosition === null ? "" : `, was #${row.previousPosition}`;
    const volume = row.searchVolume === null ? "" : ` (${row.searchVolume}/mo)`;
    lines.push(`- "${row.keyword}"${volume}: ${now}${before}`);
  }
  return lines;
}

function competitorLines(input: SeoBriefInput) {
  const own = hostOf(input.project.domain);
  const named = new Set(input.competitors.map((row) => hostOf(row.domain)));
  const lines: string[] = [];
  if (input.competitors.length > 0) {
    lines.push(
      `Competitors on file: ${input.competitors.map((row) => (row.name ? `${row.name} (${hostOf(row.domain)})` : hostOf(row.domain))).join(", ")}.`,
    );
  }
  if (input.serp.length === 0) {
    lines.push(
      "No search results have been recorded yet, so competitor positions are unknown.",
    );
    return lines;
  }
  const ourRank = new Map<string, number>();
  for (const row of input.serp) {
    if (hostOf(row.domain) !== own) continue;
    const best = ourRank.get(row.keyword);
    if (best === undefined || row.rank < best)
      ourRank.set(row.keyword, row.rank);
  }
  type Rival = { keywords: Map<string, number>; articles: Set<string> };
  const rivals = new Map<string, Rival>();
  for (const row of input.serp) {
    const host = hostOf(row.domain);
    if (!host || host === own || row.rank > 10) continue;
    const rival: Rival = rivals.get(host) ?? {
      keywords: new Map<string, number>(),
      articles: new Set<string>(),
    };
    const best = rival.keywords.get(row.keyword);
    if (best === undefined || row.rank < best)
      rival.keywords.set(row.keyword, row.rank);
    if (row.url && CONTENT_PATH.test(pathOf(row.url)))
      rival.articles.add(pathOf(row.url));
    rivals.set(host, rival);
  }
  const keywords = new Set(input.serp.map((row) => row.keyword)).size;
  lines.push(
    `Recorded Google results for ${keywords} keywords. We appear in the top 10 for ${[...ourRank.values()].filter((rank) => rank <= 10).length} of them.`,
  );
  const top = [...rivals.entries()]
    .toSorted(
      ([hostA, a], [hostB, b]) =>
        Number(named.has(hostB)) - Number(named.has(hostA)) ||
        b.keywords.size - a.keywords.size,
    )
    .slice(0, 6);
  for (const [host, rival] of top) {
    const ahead = [...rival.keywords.entries()]
      .filter(([keyword, rank]) => rank < (ourRank.get(keyword) ?? 101))
      .toSorted(([, a], [, b]) => a - b)
      .slice(0, 3)
      .map(([keyword, rank]) => `"${keyword}" #${rank}`);
    const articles =
      rival.articles.size > 0
        ? ` Ranks with ${rival.articles.size} blog/article page${rival.articles.size === 1 ? "" : "s"}.`
        : "";
    lines.push(
      `- ${host}${named.has(host) ? " (named competitor)" : ""}: top 10 for ${rival.keywords.size} keywords; ahead of us on ${ahead.length > 0 ? ahead.join(", ") : "none recorded"}.${articles}`,
    );
  }
  return lines;
}

function backlinkLines(backlinks: SeoBriefInput["backlinks"]) {
  if (!backlinks) return ["No backlink snapshot yet."];
  const change =
    backlinks.newReferringDomains !== null ||
    backlinks.lostReferringDomains !== null
      ? ` (+${backlinks.newReferringDomains ?? 0} new, -${backlinks.lostReferringDomains ?? 0} lost)`
      : "";
  return [
    `Backlinks on ${day(backlinks.capturedAt)}: ${backlinks.referringDomains ?? "unknown"} referring domains${change}, ${backlinks.backlinks ?? "unknown"} links.`,
  ];
}

export function renderSeoBrief(input: SeoBriefInput) {
  return [
    `Project: ${input.project.name}${input.project.domain ? ` (${hostOf(input.project.domain)})` : " (no domain set)"}`,
    "",
    "Site health:",
    ...(input.audit
      ? auditLines(input.audit)
      : ["No site audit has been run."]),
    "",
    "Rankings:",
    ...rankingLines(input.rankings),
    "",
    "Competition:",
    ...competitorLines(input),
    "",
    "Authority:",
    ...backlinkLines(input.backlinks),
  ].join("\n");
}

/** What the analyst is told when it does not yet know which project. */
export function renderProjectChoice(
  projects: { name: string; domain: string | null }[],
) {
  if (projects.length === 0) return "This person has no projects yet.";
  return [
    "No project has been chosen yet. Projects this person can see (do not read this list out unless asked which projects there are):",
    ...projects.map(
      (project) =>
        `- ${project.name}${project.domain ? ` (${hostOf(project.domain)})` : ""}`,
    ),
  ].join("\n");
}

import { cached } from "@/server/features/voice/cache";
import { lastChangedAt, readFile, type RepoTarget } from "./githubRepo";
import { siteFor } from "./lovablePost";

/**
 * The service pages a Lovable site already has.
 *
 * These sites keep every service in one hand-written data file — slug, title,
 * price, and the keywords the page is written for — and render a page per
 * entry. Read before proposing work: a service page that already targets a
 * search is usually better improved than written about a second time, and a
 * new article that repeats a service page competes with it.
 *
 * Read from the site's own file, so this is what the site has, not what Open
 * SEO believes it sent.
 */

/** Where these sites keep their services. */
const SERVICE_FILE = "src/data/services.ts";
const TTL_MS = 5 * 60_000;
const CURRENCY: Record<"au" | "lk", string> = { au: "AUD", lk: "LKR" };

type ParsedService = {
  slug: string;
  title: string;
  category: string | null;
  description: string;
  /** Whole currency units, written the way the site writes them. */
  priceFrom: number | null;
  /** "monthly" for a retainer; null for one-off work. */
  priceType: string | null;
  /** The first keyword the page is written for, when the site records one. */
  primaryKeyword: string | null;
  keywords: string[];
};

type SiteService = ParsedService & {
  currency: string;
  path: string;
  url: string;
  /** When the file holding every service last changed on the branch. */
  updatedAt: string | null;
};

// The file is TypeScript, not data, so it is read the way a person reads it:
// each service begins at its own quoted slug and runs to the next one. Fields
// are taken where they are found and left null where they are not, because an
// unreadable field is not a reason to hide a page that exists.
const SLUGS = /\bslug:\s*"([^"]+)"/g;
const TITLE = /\btitle:\s*(?:\r?\n\s*)?"((?:[^"\\]|\\.)*)"/;
const CATEGORY = /\bcategory:\s*"([^"]*)"/;
const DESCRIPTION = /\bdescription:\s*(?:\r?\n\s*)?"((?:[^"\\]|\\.)*)"/;
const PRICE_FROM = /\bpriceFrom:\s*(\d+)/;
const PRICE_TYPE = /\bpriceType:\s*"([^"]*)"/;
const KEYWORDS = /\bkeywords:\s*\[([\s\S]*?)\]/;
const QUOTED = /"((?:[^"\\]|\\.)*)"/g;

function readable(value: string) {
  return value
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\n/g, " ")
    .replace(/\\\\/g, "\\")
    .trim();
}

function firstMatch(chunk: string, pattern: RegExp) {
  const found = pattern.exec(chunk);
  const value = found?.[1];
  return value === undefined ? null : readable(value);
}

function keywordsIn(chunk: string) {
  const list = KEYWORDS.exec(chunk)?.[1];
  if (!list) return [];
  return [...list.matchAll(QUOTED)].flatMap((match) => {
    const word = match[1];
    return word === undefined ? [] : [readable(word)];
  });
}

/**
 * Every service in the file, in the order the site lists them.
 *
 * Pure: no network, no clock. The type declarations above the list carry
 * `slug: string`, with no quoted value, so they are passed over on their own.
 */
export function parseServices(source: string): ParsedService[] {
  const listed = source.slice(Math.max(source.indexOf("export const"), 0));
  const starts = [...listed.matchAll(SLUGS)];
  return starts.flatMap((start, index) => {
    const slug = start[1];
    const from = start.index;
    if (slug === undefined || from === undefined) return [];
    const chunk = listed.slice(from, starts[index + 1]?.index ?? listed.length);
    const title = firstMatch(chunk, TITLE);
    if (!title) return [];
    const price = PRICE_FROM.exec(chunk)?.[1];
    const keywords = keywordsIn(chunk);
    return [
      {
        slug,
        title,
        category: firstMatch(chunk, CATEGORY),
        description: firstMatch(chunk, DESCRIPTION) ?? "",
        priceFrom: price === undefined ? null : Number(price),
        priceType: firstMatch(chunk, PRICE_TYPE),
        primaryKeyword: keywords[0] ?? null,
        keywords,
      },
    ];
  });
}

/**
 * The site's service pages, with the address each one lives at.
 *
 * Every service shares one last-changed date because every service shares one
 * file; saying so is more honest than inventing a date per page.
 */
export async function listSiteServices(
  site: RepoTarget & { siteUrl: string },
  fetcher: typeof fetch = fetch,
): Promise<SiteService[]> {
  return cached(
    `site-services:${site.repository}:${site.branch}`,
    async () => {
      const source = await readFile(site, SERVICE_FILE, fetcher).catch(
        () => null,
      );
      if (!source) return [];
      const updatedAt = await lastChangedAt(site, SERVICE_FILE, fetcher).catch(
        () => null,
      );
      const origin = site.siteUrl.replace(/\/+$/, "");
      const currency = CURRENCY[siteFor(site.siteUrl)];
      return parseServices(source).map((service) => ({
        ...service,
        currency,
        path: `/services/${service.slug}`,
        url: `${origin}/services/${service.slug}`,
        updatedAt,
      }));
    },
    TTL_MS,
  );
}

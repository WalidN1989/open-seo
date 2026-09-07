/**
 * Readers for the JSON an agent attaches.
 *
 * The agent is free-form, so nothing here assumes a shape: every accessor
 * returns a usable value or nothing, and the UI decides what to say when a
 * field is missing. This is what keeps a stray payload from putting a raw
 * object — or the word "null" — in front of a client.
 */

export type Json = unknown;

function isRecord(value: Json): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** First present key wins, so camelCase and snake_case both read. */
function pick(value: Json, ...keys: string[]): unknown {
  if (!isRecord(value)) return undefined;
  for (const key of keys) {
    if (value[key] !== undefined && value[key] !== null) return value[key];
  }
  return undefined;
}

export function readText(value: Json, ...keys: string[]): string | null {
  const found = pick(value, ...keys);
  if (typeof found === "string" && found.trim()) return found.trim();
  if (typeof found === "number") return String(found);
  return null;
}

export function readNumber(value: Json, ...keys: string[]): number | null {
  const found = pick(value, ...keys);
  if (typeof found === "number" && Number.isFinite(found)) return found;
  if (typeof found === "string") {
    const parsed = Number.parseFloat(found);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function readStringList(value: Json, ...keys: string[]): string[] {
  const found = pick(value, ...keys);
  if (!Array.isArray(found)) return [];
  return found
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

export function readList(value: Json, ...keys: string[]): unknown[] {
  const found = pick(value, ...keys);
  return Array.isArray(found) ? found : [];
}

export type GscRow = {
  query: string;
  page: string | null;
  clicks: number | null;
  impressions: number | null;
  ctr: number | null;
  position: number | null;
};

export function readGscRows(snapshot: Json): GscRow[] {
  return readList(snapshot, "rows", "queries", "data")
    .map((row) => ({
      query: readText(row, "query", "keyword") ?? "",
      page: readText(row, "page", "url"),
      clicks: readNumber(row, "clicks"),
      impressions: readNumber(row, "impressions"),
      ctr: readNumber(row, "ctr"),
      position: readNumber(row, "position", "avgPosition"),
    }))
    .filter((row) => row.query);
}

export function readDateRange(snapshot: Json): string | null {
  const range = pick(snapshot, "dateRange", "period");
  const start = readText(range, "start", "from");
  const end = readText(range, "end", "to");
  if (start && end) return `${start} to ${end}`;
  return readText(snapshot, "dateRange", "period");
}

export type SerpResult = {
  rank: number | null;
  title: string | null;
  domain: string | null;
  url: string | null;
};

export function readSerpResults(snapshot: Json): SerpResult[] {
  return readList(snapshot, "results", "competitors", "organic")
    .map((row) => ({
      rank: readNumber(row, "rank", "position"),
      title: readText(row, "title", "name"),
      domain: readText(row, "domain", "displayLink"),
      url: readText(row, "url", "link"),
    }))
    .filter((row) => row.title || row.domain);
}

export type BriefLink = { anchor: string; url: string | null };

export function readBriefLinks(brief: Json): BriefLink[] {
  return readList(brief, "internalLinks", "internal_links", "links")
    .map((row) => ({
      anchor: readText(row, "anchor", "text", "label") ?? "",
      url: readText(row, "url", "href"),
    }))
    .filter((row) => row.anchor || row.url);
}

export type DraftImage = {
  placement: string | null;
  alt: string | null;
  prompt: string | null;
  url: string | null;
};

export function readDraftImages(draft: Json): DraftImage[] {
  return readList(draft, "images", "imagery")
    .map((row) => ({
      placement: readText(row, "placement", "position", "section"),
      alt: readText(row, "alt", "altText", "alt_text"),
      prompt: readText(row, "prompt", "description"),
      url: readText(row, "url", "src"),
    }))
    .filter((row) => row.alt || row.prompt || row.url);
}

/** Counts words the way a writer would, ignoring markdown punctuation. */
export function countWords(body: string | null): number {
  if (!body) return 0;
  return body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*_>`[\]()|-]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

export function formatCtr(ctr: number | null): string {
  if (ctr === null) return "—";
  // Agents send either 0.05 or 5 for five percent; both should read as 5.0%.
  const percent = ctr <= 1 ? ctr * 100 : ctr;
  return `${percent.toFixed(1)}%`;
}

export function formatPosition(position: number | null): string {
  if (position === null) return "—";
  return Number.isInteger(position) ? String(position) : position.toFixed(1);
}

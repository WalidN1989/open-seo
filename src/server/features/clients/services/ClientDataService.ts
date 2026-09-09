import { ClientDataRepository as Repo } from "../repositories/ClientDataRepository";
import type { ClientDataTopic } from "../clientDataTopics";

/**
 * One client's own data, rendered for the assistant to read out.
 *
 * The organization id is supplied by the caller from a completed
 * verification. It is never taken from the model, from the message, or from
 * anything the customer can influence — the model chooses a topic and nothing
 * else. That is the whole security design: the *what* is the model's, the
 * *whose* is never negotiable.
 *
 * Output is prose rather than JSON because it goes straight into a prompt and
 * comes back out as a WhatsApp message. Numbers are stated plainly and never
 * rounded up.
 */

const EMPTY = "Nothing has been recorded for this yet.";

function ago(timestamp: string | null | undefined) {
  if (!timestamp) return "at an unknown time";
  const then = new Date(timestamp).getTime();
  if (!Number.isFinite(then)) return "at an unknown time";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "about a month ago" : `about ${months} months ago`;
}

function movement(now: number | null, before: number | null) {
  if (now === null || before === null) return "";
  const change = before - now;
  if (change === 0) return " (no change)";
  return change > 0 ? ` (up ${change})` : ` (down ${Math.abs(change)})`;
}

async function overview(organizationId: string) {
  const [sites, tracked] = await Promise.all([
    Repo.projectsFor(organizationId),
    Repo.trackedKeywordCount(organizationId),
  ]);
  if (!sites.length) return "No website has been set up for them yet.";
  const lines = sites.map(
    (site) => `- ${site.name} (${site.domain}), set up ${ago(site.createdAt)}`,
  );
  return [
    `Websites we look after for them: ${sites.length}.`,
    ...lines,
    tracked
      ? `Keywords being tracked for position: ${tracked}.`
      : "No keywords are being tracked for position yet.",
  ].join("\n");
}

async function rankings(organizationId: string) {
  const rows = await Repo.rankingsFor(organizationId);
  if (!rows.length) return "No position check has finished for them yet.";
  const checked = ago(rows[0]?.checkedAt);
  const lines = rows
    .slice(0, 25)
    .map(
      (row) =>
        `- "${row.keyword}": position ${row.position}${movement(row.position, row.previousPosition)}`,
    );
  return [`Last checked ${checked}.`, ...lines].join("\n");
}

async function keywords(organizationId: string) {
  const rows = await Repo.keywordsFor(organizationId);
  if (!rows.length) return EMPTY;
  const lines = rows.map((row) => {
    const volume =
      row.searchVolume === null
        ? "no volume recorded"
        : `${row.searchVolume} searches a month`;
    return `- "${row.keyword}": ${volume}`;
  });
  return [`Keywords saved for their site: ${rows.length}.`, ...lines].join(
    "\n",
  );
}

async function backlinks(organizationId: string) {
  const rows = await Repo.backlinksFor(organizationId);
  if (!rows.length) return "No link data has been collected for them yet.";
  return rows
    .map((row) =>
      [
        `${row.domain}, measured ${ago(row.capturedAt)}:`,
        `${row.referringDomains ?? 0} websites link to them, ${row.backlinks ?? 0} links in total.`,
        row.newBacklinks || row.lostBacklinks
          ? `Recently gained ${row.newBacklinks ?? 0} and lost ${row.lostBacklinks ?? 0}.`
          : "",
      ]
        .filter(Boolean)
        .join(" "),
    )
    .join("\n");
}

/** Only the shape of the work — never the draft itself, which is not approved. */
const CONTENT_STATUS: Record<string, string> = {
  proposed: "waiting for our team to review",
  drafted: "being written",
  awaiting_approval: "waiting for approval",
  approved: "approved and ready to publish",
  published: "published",
  rejected: "not going ahead",
};

async function content(organizationId: string) {
  const rows = await Repo.contentFor(organizationId);
  if (!rows.length) return "No content work has been proposed for them yet.";
  const lines = rows.map((row) => {
    const what = row.keyword || row.targetUrl || row.type;
    const state = CONTENT_STATUS[row.status] ?? row.status;
    return `- ${what}: ${state}, last touched ${ago(row.updatedAt)}`;
  });
  return [`Content work on their site: ${rows.length} items.`, ...lines].join(
    "\n",
  );
}

async function siteHealth(organizationId: string) {
  const result = await Repo.siteHealthFor(organizationId);
  if (!result) return "No technical crawl of their site has finished yet.";
  const { audit, issues } = result;
  const bySeverity = new Map<string, number>();
  for (const issue of issues) {
    const key = issue.severity ?? "unknown";
    bySeverity.set(key, (bySeverity.get(key) ?? 0) + 1);
  }
  const counts = [...bySeverity.entries()]
    .map(([severity, count]) => `${count} ${severity}`)
    .join(", ");
  return [
    `Their site was last crawled ${ago(audit.completedAt)}, covering ${audit.pagesCrawled ?? 0} pages.`,
    issues.length
      ? `Issues found: ${counts}.`
      : "No issues were found in that crawl.",
  ].join("\n");
}

const READERS: Record<ClientDataTopic, (id: string) => Promise<string>> = {
  overview,
  rankings,
  keywords,
  backlinks,
  content,
  site_health: siteHealth,
};

/** Cap what one answer can carry, so a long history cannot flood the prompt. */
const MAX_CHARS = 2500;

export async function readClientData(
  clientOrganizationId: string,
  topic: ClientDataTopic,
): Promise<string> {
  const read = READERS[topic];
  const text = await read(clientOrganizationId);
  return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}\n…` : text;
}

export const ClientDataService = { readClientData };

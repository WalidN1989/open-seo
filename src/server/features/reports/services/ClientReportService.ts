import { AppError } from "@/server/lib/errors";
import { getRequiredEnvValue } from "@/server/lib/runtime-env";
import { AuthRepository } from "@/server/auth/repositories/AuthRepository";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { InvoiceRepository } from "@/server/features/invoicing/repositories/InvoiceRepository";
import { ClientReportRepository as Repo } from "../repositories/ClientReportRepository";
import { ReportDataRepository as Data } from "../repositories/ReportDataRepository";
import {
  DOCUMENT_LINK_TTL_MS,
  reportPath,
  signReportToken,
} from "../reportLink";
import {
  bucketsFor,
  headlineFor,
  moversFor,
  type ReportSnapshot,
} from "../reportSnapshot";

const MODULE = "reports" as const;

const CONTENT_LABEL: Record<string, string> = {
  proposed: "Proposed",
  drafted: "Being written",
  awaiting_approval: "Awaiting approval",
  approved: "Approved",
  published: "Published",
  rejected: "Not proceeding",
};

async function requireManage(organizationId: string, userId: string) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    MODULE,
    "manage",
  );
}

/**
 * Whose branding the report carries.
 *
 * Reuses the invoicing issuer, because it is the same thing: who this agency
 * is, in the form a client should see it. Asking for the logo and address a
 * second time would be a second set to keep current.
 */
async function agencyFor(
  organizationId: string,
): Promise<ReportSnapshot["agency"]> {
  const [settings, workspaceName] = await Promise.all([
    InvoiceRepository.getSettings(organizationId),
    Repo.organizationName(organizationId),
  ]);
  // The invoicing issuer is filled in when the first invoice goes out, which
  // may be after the first report. The workspace's own name is always there
  // and is always better than a placeholder on a document a client reads.
  return {
    name: settings?.legalName?.trim() || workspaceName?.trim() || "Your agency",
    logoUrl: settings?.logoUrl ?? null,
    email: settings?.email ?? null,
    phone: settings?.phone ?? null,
    website: settings?.website ?? null,
    addressLines: settings?.addressLines ?? null,
  };
}

async function projects(organizationId: string, userId: string) {
  await BusinessModuleService.requireAccess(organizationId, userId, MODULE);
  const memberships = await AuthRepository.listOrganizationIdsForUser(userId);
  return Repo.reportableProjects(memberships);
}

function setupFor(input: {
  searchConsole: string | null;
  analytics: boolean;
  savedKeywords: number;
  trackedKeywords: number;
  hasAudit: boolean;
  competitors: number;
}): ReportSnapshot["setup"] {
  return [
    {
      label: "Google Search Console",
      done: Boolean(input.searchConsole),
      detail: input.searchConsole
        ? `Connected for ${input.searchConsole}`
        : "Not connected yet",
    },
    {
      label: "Google Analytics",
      done: input.analytics,
      detail: input.analytics ? "Connected" : "Not connected yet",
    },
    {
      label: "Keyword research",
      done: input.savedKeywords > 0,
      detail: input.savedKeywords
        ? `${input.savedKeywords} keywords researched and saved`
        : "Not started yet",
    },
    {
      label: "Rank tracking",
      done: input.trackedKeywords > 0,
      detail: input.trackedKeywords
        ? `${input.trackedKeywords} keywords checked on a schedule`
        : "Not started yet",
    },
    {
      label: "Technical site audit",
      done: input.hasAudit,
      detail: input.hasAudit ? "Completed" : "Not run yet",
    },
    {
      label: "Competitor analysis",
      done: input.competitors > 0,
      detail: input.competitors
        ? `${input.competitors} competitors identified`
        : "Not started yet",
    },
  ];
}

async function buildSnapshot(input: {
  organizationId: string;
  projectId: string;
  clientName: string;
}): Promise<ReportSnapshot> {
  const project = await Data.project(input.projectId);
  if (!project)
    throw new AppError("NOT_FOUND", "That project no longer exists.");

  const [
    agency,
    rankings,
    savedKeywords,
    links,
    siteHealth,
    competitors,
    content,
    connections,
  ] = await Promise.all([
    agencyFor(input.organizationId),
    Data.rankings(input.projectId),
    Data.savedKeywordCount(input.projectId),
    Data.links(input.projectId),
    Data.siteHealth(input.projectId),
    Data.competitors(input.projectId),
    Data.contentCounts(input.projectId),
    Data.connections(input.projectId),
  ]);

  // A keyword with no position was checked and not found. Dropping it from the
  // ranked list keeps every average and bucket honest; counting it separately
  // keeps the report from quietly hiding the work still to do.
  const keywords = rankings.rows.filter(
    (row): row is typeof row & { position: number } => row.position !== null,
  );
  const notRanking = rankings.rows.length - keywords.length;
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    agency,
    client: {
      name: input.clientName,
      projectName: project.name,
      domain: project.domain,
      startedAt: project.createdAt,
    },
    setup: setupFor({
      searchConsole: connections.searchConsole,
      analytics: connections.analytics,
      savedKeywords,
      trackedKeywords: keywords.length,
      hasAudit: Boolean(siteHealth),
      competitors: competitors.length,
    }),
    headline: headlineFor(keywords, links, notRanking),
    buckets: bucketsFor(keywords),
    keywords: keywords.slice(0, 30),
    movers: moversFor(keywords),
    competitors,
    siteHealth,
    content: content.map((row) => ({
      label: CONTENT_LABEL[row.status] ?? row.status,
      count: row.count,
    })),
    lastCheckedAt: rankings.checkedAt,
  };
}

async function generate(
  organizationId: string,
  userId: string,
  input: { projectId: string; clientName: string },
) {
  await requireManage(organizationId, userId);
  const memberships = await AuthRepository.listOrganizationIdsForUser(userId);
  const project = await Data.project(input.projectId);
  if (!project || !memberships.includes(project.organizationId)) {
    throw new AppError("FORBIDDEN");
  }
  const snapshot = await buildSnapshot({
    organizationId,
    projectId: input.projectId,
    clientName: input.clientName.trim() || project.name,
  });
  const row = await Repo.insert({
    id: crypto.randomUUID(),
    organizationId,
    projectId: input.projectId,
    clientName: snapshot.client.name,
    snapshotJson: JSON.stringify(snapshot),
    generatedByUserId: userId,
  });
  return { id: row.id, snapshot };
}

async function list(organizationId: string, userId: string) {
  await BusinessModuleService.requireAccess(organizationId, userId, MODULE);
  return Repo.list(organizationId);
}

/**
 * The stored snapshot.
 *
 * Checked rather than asserted: this column holds JSON we wrote, but a report
 * generated by an older version of this code is a real possibility, and a
 * document that renders half-undefined is worse than one that refuses.
 */
function isSnapshot(value: unknown): value is ReportSnapshot {
  return (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    value.version === 1
  );
}

function parse(json: string): ReportSnapshot {
  const value: unknown = JSON.parse(json);
  if (!isSnapshot(value)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "That report was built by an older version. Generate it again.",
    );
  }
  return value;
}

async function get(organizationId: string, userId: string, id: string) {
  await BusinessModuleService.requireAccess(organizationId, userId, MODULE);
  const row = await Repo.get(organizationId, id);
  if (!row) throw new AppError("NOT_FOUND", "That report no longer exists.");
  return {
    id: row.id,
    createdAt: row.createdAt,
    snapshot: parse(row.snapshotJson),
  };
}

async function remove(organizationId: string, userId: string, id: string) {
  await requireManage(organizationId, userId);
  await Repo.remove(organizationId, id);
}

/** For the shared link. The caller has already verified the signed token. */
async function readForDocument(organizationId: string, id: string) {
  const row = await Repo.get(organizationId, id);
  if (!row) throw new AppError("NOT_FOUND", "That report no longer exists.");
  return {
    id: row.id,
    createdAt: row.createdAt,
    snapshot: parse(row.snapshotJson),
  };
}

async function documentLink(
  organizationId: string,
  userId: string,
  reportId: string,
) {
  await BusinessModuleService.requireAccess(organizationId, userId, MODULE);
  const row = await Repo.get(organizationId, reportId);
  if (!row) throw new AppError("NOT_FOUND", "That report no longer exists.");
  const expiresAt = Date.now() + DOCUMENT_LINK_TTL_MS;
  const token = await signReportToken(
    { reportId: row.id, organizationId, expiresAt },
    await getRequiredEnvValue("BETTER_AUTH_SECRET"),
  );
  return {
    clientName: row.clientName,
    path: reportPath(row.id, token),
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

export const ClientReportService = {
  projects,
  documentLink,
  generate,
  list,
  get,
  remove,
  readForDocument,
};

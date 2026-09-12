import type { z } from "zod";
import type { generateClientReportSchema } from "@/types/schemas/reports";
import { AppError } from "@/server/lib/errors";
import {
  getOptionalEnvValue,
  getRequiredEnvValue,
} from "@/server/lib/runtime-env";
import { AuthRepository } from "@/server/auth/repositories/AuthRepository";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { resolveLetterhead } from "../letterhead";
import {
  accessFor,
  includedFor,
  setupFor,
  type Declared,
} from "../reportSetup";
import { ClientReportRepository as Repo } from "../repositories/ClientReportRepository";
import { ReportDataRepository as Data } from "../repositories/ReportDataRepository";
import {
  DOCUMENT_LINK_TTL_MS,
  reportPath,
  signReportToken,
} from "../reportLink";
import { searchPerformanceFor } from "../searchPerformance";
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
  userId: string,
): Promise<ReportSnapshot["agency"]> {
  const [letterhead, workspaceName, whatsappNumber] = await Promise.all([
    resolveLetterhead(organizationId, userId),
    Repo.organizationName(organizationId),
    Repo.whatsappNumber(organizationId),
  ]);
  const settings = letterhead.settings;
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
    taxIdLabel: settings?.taxIdLabel ?? null,
    taxIdValue: settings?.taxIdValue ?? null,
    whatsappNumber,
  };
}

/**
 * Whose name the report will carry, shown before anything is generated.
 *
 * Reports are branded by the workspace you are in, and every client project
 * sits in its own workspace — so it is easy to be inside the client's
 * workspace and produce a report branded as the client. That was silent until
 * the document came out wrong, so the screen says it up front.
 */
async function branding(organizationId: string, userId: string) {
  await BusinessModuleService.requireAccess(organizationId, userId, MODULE);
  const [letterhead, workspaceName] = await Promise.all([
    resolveLetterhead(organizationId, userId),
    Repo.organizationName(organizationId),
  ]);
  const settings = letterhead.settings;
  return {
    name: settings?.legalName?.trim() || workspaceName?.trim() || "Your agency",
    configured: Boolean(settings?.legalName?.trim()),
    hasLogo: Boolean(settings?.logoUrl),
    workspaceName: workspaceName ?? null,
    borrowedFrom: letterhead.borrowedFrom,
    ambiguous: letterhead.ambiguous,
  };
}

async function projects(organizationId: string, userId: string) {
  await BusinessModuleService.requireAccess(organizationId, userId, MODULE);
  const memberships = await AuthRepository.listOrganizationIdsForUser(userId);
  return Repo.reportableProjects(memberships);
}

async function buildSnapshot(input: {
  organizationId: string;
  projectId: string;
  clientName: string;
  userId: string;
  appUrl: string;
  loginEmail: string | null;
  googleBusinessProfile: boolean;
  whatsappAssistant: boolean;
  declared: Declared;
  recommendations: string | null;
  googleReviewUrl: string | null;
}): Promise<ReportSnapshot> {
  const project = await Data.project(input.projectId);
  if (!project)
    throw new AppError("NOT_FOUND", "That project no longer exists.");

  const [
    agency,
    rankings,
    savedKeywords,
    researchedKeywords,
    links,
    siteHealth,
    competitors,
    observed,
    content,
    connections,
    topResearched,
  ] = await Promise.all([
    agencyFor(input.organizationId, input.userId),
    Data.rankings(input.projectId),
    Data.savedKeywordCount(input.projectId),
    Data.researchedKeywordCount(input.projectId),
    Data.links(input.projectId),
    Data.siteHealth(input.projectId),
    Data.competitors(input.projectId),
    Data.observedCompetitors(input.projectId, project.domain),
    Data.contentCounts(input.projectId),
    Data.connections(input.projectId),
    Data.topResearched(input.projectId),
  ]);
  const searchPerformance = await searchPerformanceFor(input.projectId);

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
      researchedKeywords,
      trackedKeywords: keywords.length,
      hasAudit: Boolean(siteHealth),
      competitors: competitors.length || observed.length,
      declared: input.declared,
    }),
    headline: headlineFor(keywords, links, notRanking),
    buckets: bucketsFor(keywords),
    keywords: keywords.slice(0, 30),
    movers: moversFor(keywords),
    // Anything written down wins: somebody chose those. The observed list is
    // the fallback, and the report says which it is looking at.
    competitors: competitors.length
      ? competitors
      : observed.map((item) => ({
          domain: item.domain,
          name: null,
          keywords: item.keywords,
          bestRank: item.bestRank,
          examples: item.examples,
        })),
    competitorsFromSearch: competitors.length === 0 && observed.length > 0,
    siteHealth,
    content: content.map((row) => ({
      label: CONTENT_LABEL[row.status] ?? row.status,
      count: row.count,
    })),
    lastCheckedAt: rankings.checkedAt,
    searchPerformance,
    access: accessFor(input.projectId, input.appUrl, input.loginEmail),
    included: includedFor({
      keywords: savedKeywords > 0 || researchedKeywords > 0,
      content: content.length > 0,
      competitors: competitors.length > 0 || observed.length > 0,
      audit: Boolean(siteHealth),
      links: Boolean(links),
      reporting: Boolean(connections.searchConsole) || connections.analytics,
      // Not project-scoped: these are set up for the business as a whole, so
      // the person generating the report says whether they apply.
      gbp: input.googleBusinessProfile,
      whatsapp: input.whatsappAssistant,
    }),
    recommendations: input.recommendations,
    googleReviewUrl: input.googleReviewUrl,
    keywordsToConfirm: topResearched,
  };
}

async function generate(
  organizationId: string,
  userId: string,
  input: z.infer<typeof generateClientReportSchema>,
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
    userId,
    appUrl: (await getOptionalEnvValue("BETTER_AUTH_URL")) ?? "",
    loginEmail: input.loginEmail?.trim() || null,
    googleBusinessProfile: input.googleBusinessProfile,
    whatsappAssistant: input.whatsappAssistant,
    declared: {
      sitemap: input.sitemap,
      tagManager: input.tagManager,
      googleBusinessProfile: input.googleBusinessProfile,
      googleReviews: input.googleReviews,
      emailMarketing: input.emailMarketing,
      facebookUrl: input.facebookUrl || null,
      facebookManaged: input.facebookManaged,
      instagramUrl: input.instagramUrl || null,
      instagramManaged: input.instagramManaged,
    },
    recommendations: input.recommendations || null,
    googleReviewUrl: input.googleReviewUrl || null,
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
  branding,
  projects,
  documentLink,
  generate,
  list,
  get,
  remove,
  readForDocument,
};

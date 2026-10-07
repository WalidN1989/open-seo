/**
 * Every tool the MCP server offers, in one list.
 *
 * The server used to hold this as a run of register() calls, which meant
 * anything else wanting the same surface — the voice agent, the contract
 * doc — kept its own copy and quietly fell behind. One list, read by both,
 * cannot drift.
 */
import type {
  McpModuleSurface,
  McpToolAccessPolicy,
  McpToolLike,
} from "@/server/mcp/module-registry";
import { addRankTrackingKeywordsTool } from "@/server/mcp/tools/add-rank-tracking-keywords";
import { createProjectTool } from "@/server/mcp/tools/create-project";
import { createRankTrackerTool } from "@/server/mcp/tools/create-rank-tracker";
import { commerceSurface } from "@/server/mcp/tools/branch-stock-tools";
import { crmSurface } from "@/server/mcp/tools/crm-tools";
import { crmWriteSurface } from "@/server/mcp/tools/crm-write-tools";
import { emailSurface } from "@/server/mcp/tools/email-tools";
import { draftWriteSurface } from "@/server/mcp/tools/draft-write-tools";
import { estimateRankTrackerCostTool } from "@/server/mcp/tools/estimate-rank-tracker-cost";
import {
  findSerpCompetitorsTool,
  getGoogleBusinessQuestionsTool,
  getKeywordMetricsTool,
  getLocalSerpResultsTool,
  getRankedKeywordsTool,
  searchLocalBusinessesTool,
} from "@/server/mcp/tools/dataforseo-research-tools";
import {
  getAuditIssuesTool,
  getAuditPagesTool,
  getAuditStatusTool,
  runSiteAuditTool,
} from "@/server/mcp/tools/site-audit-tools";
import { getBacklinksOverviewTool } from "@/server/mcp/tools/get-backlinks-overview";
import { getBacklinksProfileTool } from "@/server/mcp/tools/get-backlinks-profile";
import {
  getBusinessProfileTool,
  getBusinessReviewsTool,
  getBusinessUpdatesTool,
  getLocalRankGridTool,
  listBusinessCategoriesTool,
} from "@/server/mcp/tools/local-seo-tools";
import { getDomainKeywordSuggestionsTool } from "@/server/mcp/tools/get-domain-keyword-suggestions";
import { getDomainOverviewTool } from "@/server/mcp/tools/get-domain-overview";
import {
  getGoogleAnalyticsAudienceBreakdownTool,
  getGoogleAnalyticsEcommercePerformanceTool,
  getGoogleAnalyticsKeyEventsTool,
  getGoogleAnalyticsMeasurementHealthTool,
  getGoogleAnalyticsOrganicLandingPagesTool,
  getGoogleAnalyticsOrganicOverviewTool,
  getGoogleAnalyticsPagePerformanceTool,
  getGoogleAnalyticsSiteSearchTool,
  getGoogleAnalyticsTrafficAcquisitionTool,
  getSearchOpportunitiesTool,
} from "@/server/mcp/tools/google-analytics-tools";
import {
  getProjectContextTool,
  updateProjectContextTool,
} from "@/server/mcp/tools/project-context";
import { getRankTrackerTool } from "@/server/mcp/tools/get-rank-tracker";
import {
  getSearchConsolePerformanceTool,
  inspectUrlsTool,
} from "@/server/mcp/tools/search-console-tools";
import { getSerpResultsTool } from "@/server/mcp/tools/get-serp-results";
import { invoiceSurface } from "@/server/mcp/tools/invoice-tools";
import { listProjectsTool } from "@/server/mcp/tools/list-projects";
import { listSavedKeywordsTool } from "@/server/mcp/tools/list-saved-keywords";
import { optimizationsSurface } from "@/server/mcp/tools/optimization-tools";
import { quoteSurface } from "@/server/mcp/tools/quote-tools";
import { removeRankTrackingKeywordsTool } from "@/server/mcp/tools/remove-rank-tracking-keywords";
import { reportSurface } from "@/server/mcp/tools/report-tools";
import { researchKeywordsTool } from "@/server/mcp/tools/research-keywords";
import { runRankTrackerTool } from "@/server/mcp/tools/run-rank-tracker";
import { saveKeywordsTool } from "@/server/mcp/tools/save-keywords";
import { smsSurface } from "@/server/mcp/tools/sms-tools";
import { whatsappSurface } from "@/server/mcp/tools/whatsapp-tools";
import { whoamiTool } from "@/server/mcp/tools/whoami";
import { voiceSurface } from "@/server/mcp/tools/voice-tools";

export const MODULE_SURFACES: readonly McpModuleSurface[] = [
  optimizationsSurface,
  invoiceSurface,
  quoteSurface,
  crmSurface,
  crmWriteSurface,
  commerceSurface,
  reportSurface,
  emailSurface,
  draftWriteSurface,
  smsSurface,
  whatsappSurface,
  voiceSurface,
];

export const ALL_MCP_TOOLS: readonly McpToolLike[] = [
  whoamiTool,
  listProjectsTool,
  createProjectTool,
  getProjectContextTool,
  updateProjectContextTool,
  listSavedKeywordsTool,
  researchKeywordsTool,
  saveKeywordsTool,
  getDomainOverviewTool,
  getDomainKeywordSuggestionsTool,
  getBacklinksOverviewTool,
  getBacklinksProfileTool,
  getSerpResultsTool,
  createRankTrackerTool,
  getRankTrackerTool,
  addRankTrackingKeywordsTool,
  removeRankTrackingKeywordsTool,
  estimateRankTrackerCostTool,
  runRankTrackerTool,
  getRankedKeywordsTool,
  findSerpCompetitorsTool,
  searchLocalBusinessesTool,
  getLocalSerpResultsTool,
  getGoogleBusinessQuestionsTool,
  getBusinessProfileTool,
  getBusinessReviewsTool,
  getBusinessUpdatesTool,
  listBusinessCategoriesTool,
  getLocalRankGridTool,
  getKeywordMetricsTool,
  getSearchConsolePerformanceTool,
  inspectUrlsTool,
  getGoogleAnalyticsOrganicLandingPagesTool,
  getGoogleAnalyticsPagePerformanceTool,
  getGoogleAnalyticsKeyEventsTool,
  getSearchOpportunitiesTool,
  getGoogleAnalyticsOrganicOverviewTool,
  getGoogleAnalyticsTrafficAcquisitionTool,
  getGoogleAnalyticsMeasurementHealthTool,
  getGoogleAnalyticsEcommercePerformanceTool,
  getGoogleAnalyticsSiteSearchTool,
  getGoogleAnalyticsAudienceBreakdownTool,
  runSiteAuditTool,
  getAuditStatusTool,
  getAuditIssuesTool,
  getAuditPagesTool,
  ...MODULE_SURFACES.flatMap((surface) => surface.tools),
];

function isReadOnlyTool(tool: McpToolLike) {
  const annotations = tool.config.annotations;
  return (
    typeof annotations === "object" &&
    annotations !== null &&
    "readOnlyHint" in annotations &&
    annotations.readOnlyHint === true
  );
}

/** Scope policy for Business-module tools; SEO tools intentionally have none. */
export const MCP_TOOL_ACCESS = new Map<string, McpToolAccessPolicy>(
  MODULE_SURFACES.flatMap((surface) =>
    surface.tools.map((tool) => {
      const readOnly = isReadOnlyTool(tool);
      return [
        tool.name,
        {
          scope: readOnly
            ? surface.access.readScope
            : surface.access.writeScope,
          legacyCompatible:
            surface.access.legacyCompatible &&
            !surface.access.strictTools?.includes(tool.name),
          tenantScope: surface.scope,
        },
      ] as const;
    }),
  ),
);

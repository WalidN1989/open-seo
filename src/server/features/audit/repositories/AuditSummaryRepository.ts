import { eq } from "drizzle-orm";
import { db } from "@/db";
import { auditIssues, auditPages } from "@/db/schema";

/**
 * The narrow reads behind a summary of an audit — a spoken answer waits on
 * these, so they select the few columns a summary needs rather than every
 * column of every crawled page.
 */

/** Just the addresses, for callers that only need to know what was crawled. */
async function getPageUrlsForAudit(auditId: string) {
  return db
    .select({ url: auditPages.url })
    .from(auditPages)
    .where(eq(auditPages.auditId, auditId));
}

/** Issues with only the three columns a summary needs, not every column. */
async function getIssueRowsForAudit(auditId: string) {
  return db
    .select({
      issueType: auditIssues.issueType,
      severity: auditIssues.severity,
      pageUrl: auditIssues.pageUrl,
    })
    .from(auditIssues)
    .where(eq(auditIssues.auditId, auditId));
}

export const AuditSummaryRepository = {
  getPageUrlsForAudit,
  getIssueRowsForAudit,
};

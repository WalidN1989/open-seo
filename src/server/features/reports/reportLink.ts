/**
 * Signed, time-limited links to a handover report.
 *
 * Same rule as the invoice link: the workspace travels inside the signature,
 * so a link cannot be edited into addressing another tenant's report. A client
 * has no account, so the token is the whole credential.
 */
import {
  DOCUMENT_LINK_TTL_MS,
  signToken,
  verifyToken,
} from "@/server/lib/signed-token";

export type ReportClaims = {
  reportId: string;
  organizationId: string;
  /** Epoch milliseconds. */
  expiresAt: number;
};

function isReportClaims(value: unknown): value is ReportClaims {
  if (typeof value !== "object" || value === null) return false;
  return (
    "reportId" in value &&
    typeof value.reportId === "string" &&
    "organizationId" in value &&
    typeof value.organizationId === "string" &&
    "expiresAt" in value &&
    typeof value.expiresAt === "number"
  );
}

export async function signReportToken(
  claims: ReportClaims,
  secret: string,
): Promise<string> {
  return signToken(claims, secret);
}

export async function verifyReportToken(
  token: string,
  secret: string,
  now: number,
): Promise<ReportClaims | null> {
  const claims = await verifyToken(token, secret, isReportClaims);
  if (!claims) return null;
  if (claims.expiresAt <= now) return null;
  return claims;
}

export { DOCUMENT_LINK_TTL_MS };

export function reportPath(reportId: string, token: string): string {
  return `/reports/${encodeURIComponent(reportId)}?t=${encodeURIComponent(token)}`;
}

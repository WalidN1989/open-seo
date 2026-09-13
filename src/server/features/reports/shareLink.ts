import { AppError } from "@/server/lib/errors";
import { getRequiredEnvValue } from "@/server/lib/runtime-env";
import {
  DOCUMENT_LINK_TTL_MS,
  newShortCode,
  reportPath,
  shortReportPath,
  signReportToken,
} from "./reportLink";
import { ClientReportRepository as Repo } from "./repositories/ClientReportRepository";

/**
 * A link a client can open without an account: a short code in front, the
 * signed token behind it. The same short link comes back while it has a
 * week or more left, so a client who was sent it twice holds one address.
 */
export async function shareLinkFor(
  organizationId: string,
  userId: string,
  reportId: string,
) {
  const row = await Repo.get(organizationId, reportId);
  if (!row) throw new AppError("NOT_FOUND", "That report no longer exists.");
  const reusable = await Repo.latestLinkFor(
    organizationId,
    row.id,
    new Date(Date.now() + 7 * 24 * 3600e3).toISOString(),
  );
  if (reusable) {
    return {
      clientName: row.clientName,
      path: shortReportPath(reusable.id),
      fallbackPath: reportPath(row.id, reusable.token),
      expiresAt: reusable.expiresAt,
    };
  }
  const expiresAt = Date.now() + DOCUMENT_LINK_TTL_MS;
  const token = await signReportToken(
    { reportId: row.id, organizationId, expiresAt },
    await getRequiredEnvValue("BETTER_AUTH_SECRET"),
  );
  const link = await Repo.insertLink({
    id: newShortCode(),
    organizationId,
    reportId: row.id,
    token,
    expiresAt: new Date(expiresAt).toISOString(),
    createdByUserId: userId,
  });
  return {
    clientName: row.clientName,
    path: shortReportPath(link.id),
    fallbackPath: reportPath(row.id, token),
    expiresAt: link.expiresAt,
  };
}

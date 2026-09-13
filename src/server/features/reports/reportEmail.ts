import { getResendConfig, sendResendActionEmail } from "@/server/email/resend";
import { AppError } from "@/server/lib/errors";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import type { ReportSnapshot } from "./reportSnapshot";

/**
 * Email the report to the client as a link.
 *
 * A link, never an attachment. The page is the report — it carries the
 * download button, it is what the share link opens, and a link can be sent by
 * an agent that has no way to attach a file. Sent from the agency's name on
 * the verified sending address, with replies going to the agency's own inbox.
 *
 * The collaborators are passed in rather than imported so this file does not
 * reach back into the service that calls it.
 */
export async function sendReportToClient(deps: {
  organizationId: string;
  userId: string;
  input: { reportId: string; to: string; note?: string | null };
  requireManage: (organizationId: string, userId: string) => Promise<void>;
  documentLink: (
    organizationId: string,
    userId: string,
    reportId: string,
  ) => Promise<{ path: string; expiresAt: string }>;
  getReport: (
    organizationId: string,
    id: string,
  ) => Promise<{ snapshotJson: string } | null>;
  markSent: (organizationId: string, id: string, to: string) => Promise<void>;
  parse: (json: string) => ReportSnapshot;
}) {
  const { organizationId, userId, input } = deps;
  await deps.requireManage(organizationId, userId);
  const config = getResendConfig();
  if (!config) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Email is not configured on this server: RESEND_API_KEY and RESEND_FROM_EMAIL are needed.",
    );
  }
  const row = await deps.getReport(organizationId, input.reportId);
  if (!row) throw new AppError("NOT_FOUND", "That report no longer exists.");
  const snapshot = deps.parse(row.snapshotJson);
  const link = await deps.documentLink(organizationId, userId, input.reportId);
  const appUrl = ((await getOptionalEnvValue("BETTER_AUTH_URL")) ?? "").replace(
    /\/+$/,
    "",
  );
  const url = `${appUrl}${link.path}`;
  const agency = snapshot.agency;

  const body = [
    `Your search performance report is ready. It shows what has been set up for ${snapshot.client.name}, where you stand on Google today, and what happens next.`,
    input.note?.trim() || "",
    "The link works for thirty days and needs no login. Open it on any device, and use Download as PDF if you would like a copy.",
  ]
    .filter(Boolean)
    .join("\n\n");

  await sendResendActionEmail(config, {
    to: input.to,
    subject: `Your report from ${agency.name}`,
    heading: `${snapshot.client.name}: your report is ready`,
    body,
    buttonLabel: "Review your report",
    actionUrl: url,
    footer: [agency.name, agency.phone, agency.email]
      .filter(Boolean)
      .join(" · "),
    fromName: agency.name,
    replyTo: agency.email ?? undefined,
  });
  await deps.markSent(organizationId, input.reportId, input.to);
  return { to: input.to, url, expiresAt: link.expiresAt };
}

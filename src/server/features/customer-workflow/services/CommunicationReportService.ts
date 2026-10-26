import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { isSouthsideWorkflow } from "@/server/features/customer-workflow/policy";
import { AppError } from "@/server/lib/errors";
import { ActionRepository } from "../repositories/ActionRepository";
import { CommunicationReportRepository as Repo } from "../repositories/CommunicationReportRepository";
import { callTotals, deliveryCounts, statusTone } from "../report";
import { EmailDeliveryReportService } from "./EmailDeliveryReportService";
async function read(organizationId: string, userId: string, days: number) {
  if (!(await isSouthsideWorkflow(organizationId)))
    throw new AppError("FORBIDDEN");
  await BusinessModuleService.requireAccess(organizationId, userId, "voice");
  const access = await BusinessModuleService.getAccess(organizationId, userId);
  const allowed = new Set(
    access.filter((a) => a.enabled && a.permission).map((a) => a.key),
  );
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const [data, allRequests, deliveryReports] = await Promise.all([
    Repo.read(organizationId, since, allowed),
    ActionRepository.list(organizationId),
    allowed.has("email")
      ? EmailDeliveryReportService.scan(organizationId, since)
      : { status: "restricted", reports: [], truncated: false },
  ]);
  const effects = allRequests.filter((r) => r.kind.startsWith("system_"));
  const requests = allRequests
    .filter((r) => !r.kind.startsWith("system_"))
    .map((r) =>
      Date.parse(r.expiresAt) < Date.now() &&
      ["needs_approval", "approved"].includes(r.status)
        ? { ...r, status: "expired" }
        : r,
    )
    .filter((r) =>
      allowed.has(
        r.kind === "quote"
          ? "invoicing"
          : r.kind === "sms"
            ? "sms"
            : r.kind.startsWith("whatsapp")
              ? "whatsapp"
              : r.kind === "lead_stage"
                ? "leads"
                : r.kind === "callback"
                  ? "voice"
                  : "email",
      ),
    );
  const attention = [
    ...effects
      .filter((r) => r.status !== "completed")
      .map((r) => ({
        id: r.id,
        type: r.kind,
        status:
          r.status === "sending" &&
          Date.parse(r.updatedAt) < Date.now() - 300000
            ? "unknown"
            : r.status,
        detail: r.error ?? "Post-call follow-up has not completed.",
        tone: "red" as const,
      })),
    ...requests
      .filter((r) => r.kind === "callback" && r.status === "completed")
      .filter((r) => !r.resultJson?.includes('"status":"contact_corrected"'))
      .map((r) => ({
        id: r.id,
        type: "callback",
        status: "follow_up",
        detail:
          "Review callback result and confirmed contact details before preparing a resend.",
        tone: "amber" as const,
      })),
    ...data.mailboxes
      .filter((m) => m.lastError || m.status !== "connected")
      .map((m, i) => ({
        id: `mailbox-${i}`,
        type: "mailbox",
        status: m.status,
        detail: m.lastError ?? "Mailbox is not connected",
        tone: "red" as const,
      })),

    ...requests
      .filter((r) => r.status !== "completed" && r.status !== "rejected")
      .map((r) => ({
        id: r.id,
        type: r.kind,
        status:
          r.status === "sending" &&
          Date.parse(r.updatedAt) < Date.now() - 300000
            ? "unknown"
            : r.status,
        detail: r.error ?? `Customer action ${r.status}`,
        tone: statusTone(r.status),
      })),
    ...data.recentCalls
      .filter(
        (c) =>
          c.welcomeStatus === null ||
          c.recapEmailStatus === null ||
          /failed|skipped|unknown/.test(
            `${c.welcomeStatus} ${c.recapEmailStatus}`,
          ),
      )
      .map((c) => ({
        id: c.id,
        type: "call_followup",
        status: "attention",
        detail: `WhatsApp: ${c.welcomeStatus ?? "unknown"}; email: ${c.recapEmailStatus ?? "unknown"}`,
        tone: "red" as const,
      })),
    ...deliveryReports.reports.map((r) => ({
      id: r.id,
      type: "email_delivery_report",
      status: r.status,
      detail: `${r.subject}: ${r.reason ?? "Open original report"}`,
      tone: "red" as const,
    })),
    ...data.recentEmails
      .filter((m) => /bounce|fail|reject/.test(m.status))
      .map((m) => ({
        id: m.id,
        type: "email",
        status: m.status,
        detail: m.subject ?? "Email delivery failure",
        tone: "red" as const,
      })),
    ...data.recentWhatsapp
      .filter((m) => /fail|undelivered/.test(m.status))
      .map((m) => ({
        id: m.id,
        type: "whatsapp",
        status: m.status,
        detail: "WhatsApp delivery failed",
        tone: "red" as const,
      })),
    ...data.recentSms
      .filter((m) => /fail|undelivered/.test(m.status))
      .map((m) => ({
        id: m.id,
        type: "sms",
        status: m.status,
        detail: m.error ?? "SMS delivery failed",
        tone: "red" as const,
      })),
  ];
  return {
    generatedAt: new Date().toISOString(),
    since,
    days,
    calls: callTotals(data.callCounts),
    channels: {
      email: deliveryCounts(data.emailCounts),
      whatsapp: deliveryCounts(data.whatsappCounts),
      sms: deliveryCounts(data.smsCounts),
    },
    attention,
    requests,
    effects,
    deliveryReports,
    ...data,
    detailLimit: 50,
    detailsMayBeTruncated: true,
    notes: [
      "Sent means provider accepted; only delivered/read is delivery evidence.",
      "NDRs are reported failures; an unmatched report does not update a message's status.",
      "Recent detail and attention lists are bounded; counts cover the full selected range.",
      "No AI or research credits used. Read-only provider calls may use hosting resources.",
    ],
  };
}
export const CommunicationReportService = { read };

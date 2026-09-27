import type { BusinessModuleKey } from "@/shared/business-modules";
import type {
  PerformanceConnection,
  PerformanceMetric,
  PerformanceProject,
  PerformanceRecord,
} from "@/shared/performance";
import { EmailRepository } from "@/server/features/email/repositories/EmailRepository";
import { CommunicationsRepository } from "@/server/features/communications/repositories/CommunicationsRepository";
import { CrmRepository } from "@/server/features/crm/repositories/CrmRepository";
import { QuoteRepository } from "@/server/features/quotes/repositories/QuoteRepository";
import { IntegrationSyncRepository } from "@/server/features/commerce/repositories/IntegrationSyncRepository";

function recordedTime(value: string | null) {
  if (!value) return null;
  // SQLite current_timestamp is UTC without a zone; provider timestamps use ISO.
  const normalized = value.replace(" ", "T");
  const milliseconds = Date.parse(
    /(?:Z|[+-]\d{2}:\d{2})$/i.test(normalized) ? normalized : `${normalized}Z`,
  );
  return Number.isFinite(milliseconds)
    ? new Date(milliseconds).toISOString()
    : null;
}

export async function collectOperations(
  project: PerformanceProject,
  modules: Set<BusinessModuleKey>,
  now: Date,
) {
  const metrics: PerformanceMetric[] = [];
  const attention: PerformanceRecord[] = [];
  const activity: PerformanceRecord[] = [];
  const connections: PerformanceConnection[] = [];
  const unavailable: string[] = [];
  let latestEmail: PerformanceRecord | null = null;
  const record = (
    row: Omit<PerformanceRecord, "projectId" | "projectName">,
  ): PerformanceRecord => ({
    ...row,
    timestamp: recordedTime(row.timestamp),
    projectId: project.id,
    projectName: project.name,
  });
  const metric = (key: string, label: string, count: number) =>
    metrics.push({ key, label, count, organizations: 1 });
  const collect = async (
    module: BusinessModuleKey,
    run: () => Promise<void>,
  ) => {
    if (!modules.has(module)) return;
    try {
      await run();
    } catch {
      unavailable.push(`${project.name}: ${module} could not be checked.`);
    }
  };
  await collect("email", async () => {
    const data = await EmailRepository.getPerformance(
      project.organizationId,
      new Date(now.getTime() - 86_400_000).toISOString(),
    );
    metric(
      "email_connected",
      "Connected email accounts",
      data.accounts.filter((a) => a.status === "connected").length,
    );
    metric("email_inbound", "Emails received · 24h", data.inbound);
    metric("email_unanswered", "Unanswered email threads", data.unanswered);
    metric("email_drafts", "Email drafts awaiting approval", data.drafts);
    for (const a of data.accounts)
      connections.push({
        ...record({
          id: `email-account:${a.id}`,
          kind: "email",
          title: a.name,
          detail: a.error
            ? "Email account reports an error"
            : "Recorded email account state",
          timestamp: a.updatedAt,
          path: "/modules/email",
        }),
        status: a.status,
        failed: Boolean(a.error) || a.status === "error",
      });
    const emailRow = (
      id: string,
      title: string | null,
      at: string | null,
      detail: string,
      threadId = id,
    ) =>
      record({
        id: `email:${id}`,
        title: title || "Email",
        detail,
        timestamp: at,
        kind: "email",
        path: `/modules/email?thread=${encodeURIComponent(threadId)}`,
      });
    attention.push(
      ...data.waiting.map((r) =>
        emailRow(
          r.id,
          r.title,
          r.at,
          "Customer wrote last; thread is not solved",
        ),
      ),
    );
    attention.push(
      ...data.pending.map((r) =>
        emailRow(r.id, r.title, r.at, "Draft awaiting approval", r.threadId),
      ),
    );
    const recent = data.recent.map((r) =>
      emailRow(r.id, r.title, r.at, "Received email", r.threadId),
    );
    activity.push(...recent);
    latestEmail = recent[0] ?? null;
  });
  await collect("whatsapp", async () => {
    const data = await CommunicationsRepository.getPerformance(
      project.organizationId,
    );
    metric("whatsapp_pending", "WhatsApp awaiting a human", data.waiting);
    metric(
      "whatsapp_connected",
      "Connected WhatsApp accounts",
      data.connections.filter((c) => c.status === "connected").length,
    );
    for (const c of data.connections)
      connections.push({
        ...record({
          id: `whatsapp-account:${c.id}`,
          kind: "whatsapp",
          title: c.name || c.provider,
          detail: c.error
            ? "WhatsApp connection reports an error"
            : "Recorded WhatsApp connection state",
          timestamp: c.checkedAt,
          path: "/modules/whatsapp",
        }),
        status: c.status,
        failed: Boolean(c.error) || c.status === "error",
      });
    attention.push(
      ...data.conversations.map((c) =>
        record({
          id: `whatsapp:${c.id}`,
          title: "WhatsApp needs a human",
          kind: "whatsapp",
          detail: "Conversation marked pending",
          timestamp: c.at,
          path: `/modules/whatsapp?conversation=${encodeURIComponent(c.id)}`,
        }),
      ),
    );
  });
  await collect("leads", async () => {
    const data = await CrmRepository.getPerformance(
      project.organizationId,
      now.toISOString(),
    );
    metric("leads_open", "Open leads", data.total);
    metric("leads_overdue", "Overdue lead follow-ups", data.overdue);
    attention.push(
      ...data.leads.map((r) =>
        record({
          id: `lead:${r.id}`,
          title: r.title,
          kind: "leads",
          detail: "Follow-up overdue",
          timestamp: r.at,
          path: `/modules/leads/${encodeURIComponent(r.id)}`,
        }),
      ),
    );
    activity.push(
      ...data.activity.map((r) =>
        record({
          id: `lead-activity:${r.id}`,
          title: r.title,
          kind: "leads",
          detail: "Lead activity",
          timestamp: r.at,
          path: `/modules/leads/${encodeURIComponent(r.leadId ?? "")}`,
        }),
      ),
    );
  });
  await collect("invoicing", async () => {
    const data = await QuoteRepository.getPerformance(
      project.organizationId,
      now.toISOString().slice(0, 10),
      new Date(now.getTime() + 7 * 86_400_000).toISOString().slice(0, 10),
    );
    metric("quotes_draft", "Draft quotes", data.drafts);
    metric(
      "quotes_accepted",
      "Accepted quotes needing an invoice",
      data.accepted,
    );
    metric("quotes_expiring", "Quotes expiring · 7 days", data.expiring);
    attention.push(
      ...data.attention.map((r) =>
        record({
          id: `quote:${r.id}`,
          title: r.title,
          kind: "quotes",
          detail:
            r.status === "accepted"
              ? "Accepted; invoice not yet created"
              : r.status === "draft"
                ? "Draft quote"
                : `Expires ${r.validUntil}`,
          timestamp: r.at,
          path: `/modules/quotes/${encodeURIComponent(r.id)}`,
        }),
      ),
    );
    activity.push(
      ...data.recent.map((r) =>
        record({
          id: `quote-activity:${r.id}`,
          title: r.title,
          kind: "quotes",
          detail: `Quote ${r.status}`,
          timestamp: r.at,
          path: `/modules/quotes/${encodeURIComponent(r.id)}`,
        }),
      ),
    );
  });
  await collect("integrations", async () => {
    const data = await IntegrationSyncRepository.getPerformance(
      project.organizationId,
    );
    for (const c of data)
      connections.push({
        ...record({
          id: `integration:${c.id}`,
          title: c.name,
          kind: "integrations",
          detail: `Sync: ${c.syncStatus}`,
          timestamp: c.checkedAt ?? c.syncedAt,
          path: `/modules/integrations/${encodeURIComponent(c.provider)}`,
        }),
        status: c.status,
        failed: c.status === "error" || c.syncStatus === "error",
      });
  });
  attention.push(...connections.filter((c) => c.failed));
  return {
    metrics,
    attention,
    activity,
    connections,
    unavailable,
    latestEmail,
  };
}

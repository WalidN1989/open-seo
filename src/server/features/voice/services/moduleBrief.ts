import { BusinessModuleRepository } from "@/server/features/business-modules/repositories/BusinessModuleRepository";
import {
  buildBriefing,
  type BriefingData,
} from "@/server/features/crm/briefing";
import { BriefingRepository as Repo } from "@/server/features/crm/repositories/BriefingRepository";
import {
  businessModuleCatalog,
  type BusinessModuleKey,
} from "@/shared/business-modules";

function none<T>(): readonly T[] {
  return [];
}

/** How far back the analyst looks when asked "what's happening". */
const WINDOW_DAYS = 30;

/**
 * What the business modules hold for one workspace: which are switched on,
 * and — for those only — what happened in them over the last month.
 *
 * The briefing is built from the same reads as the twice-daily business
 * briefing, but a source whose module is off is handed over empty, so a
 * workspace that never bought WhatsApp is never told about WhatsApp traffic.
 * "Leads" is the CRM's other half and is spoken of as the CRM, the way the
 * Business page shows it.
 */
export async function moduleBrief(organizationId: string) {
  const entitlements =
    await BusinessModuleRepository.listEntitlements(organizationId);
  const enabled = new Set(
    entitlements
      .filter((row) => row.status === "enabled")
      .map((row) => row.moduleKey),
  );
  const on = { has: (key: BusinessModuleKey) => enabled.has(key) };
  const crm = on.has("crm") || on.has("leads");
  const listed = businessModuleCatalog.filter(
    (module) =>
      module.key !== "leads" && (module.key !== "reports" || on.has("reports")),
  );
  const active = listed.filter(
    (module) => on.has(module.key) || (module.key === "crm" && crm),
  );
  const inactive = listed.filter((module) => !active.includes(module));

  const now = new Date();
  const since = new Date(
    now.getTime() - WINDOW_DAYS * 86_400_000,
  ).toISOString();
  const endOfToday = `${now.toISOString().slice(0, 10)}T23:59:59.999Z`;
  const [
    calls,
    newLeads,
    emails,
    draftsWaiting,
    quotes,
    followUpsDue,
    remindersWaiting,
    whatsapp,
    sms,
  ] = await Promise.all([
    on.has("voice")
      ? Repo.calls(organizationId, since)
      : none<BriefingData["calls"][number]>(),
    crm
      ? Repo.newLeads(organizationId, since)
      : none<BriefingData["newLeads"][number]>(),
    on.has("email")
      ? Repo.emails(organizationId, since)
      : none<BriefingData["emails"][number]>(),
    on.has("email")
      ? Repo.draftsWaiting(organizationId)
      : none<BriefingData["draftsWaiting"][number]>(),
    on.has("invoicing")
      ? Repo.openQuotes(organizationId)
      : none<BriefingData["quotes"][number]>(),
    crm
      ? Repo.followUpsDue(organizationId, endOfToday)
      : none<BriefingData["followUpsDue"][number]>(),
    crm
      ? Repo.remindersWaiting(organizationId, now.toISOString())
      : none<BriefingData["remindersWaiting"][number]>(),
    on.has("whatsapp")
      ? Repo.whatsapp(organizationId, since)
      : { messages: 0, chats: 0, waitingForPerson: 0 },
    on.has("sms")
      ? Repo.sms(organizationId, since)
      : { messages: 0, conversations: 0 },
  ]);
  const briefing = buildBriefing({
    since,
    now: now.toISOString(),
    calls,
    newLeads,
    emails,
    draftsWaiting,
    quotes,
    followUpsDue,
    remindersWaiting,
    whatsapp,
    sms,
  });

  return [
    `Active business modules: ${active.map((module) => module.label).join(", ") || "none"}.`,
    `Inactive business modules: ${inactive.map((module) => module.label).join(", ") || "none"}.`,
    ...(active.length > 0
      ? [
          `Activity in the active modules over the last ${WINDOW_DAYS} days:`,
          briefing.text,
        ]
      : []),
  ].join("\n");
}

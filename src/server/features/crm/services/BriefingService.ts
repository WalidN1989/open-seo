import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { buildBriefing } from "../briefing";
import { BriefingRepository as Repo } from "../repositories/BriefingRepository";

/** The workspace's briefing for the last `sinceHours`, for a lead-module user. */
async function getBriefing(
  organizationId: string,
  userId: string,
  sinceHours: number,
) {
  await BusinessModuleService.requireAccess(organizationId, userId, "leads");
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const since = new Date(
    nowDate.getTime() - sinceHours * 60 * 60 * 1000,
  ).toISOString();
  const endOfToday = `${now.slice(0, 10)}T23:59:59.999Z`;
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
    Repo.calls(organizationId, since),
    Repo.newLeads(organizationId, since),
    Repo.emails(organizationId, since),
    Repo.draftsWaiting(organizationId),
    Repo.openQuotes(organizationId),
    Repo.followUpsDue(organizationId, endOfToday),
    Repo.remindersWaiting(organizationId, now),
    Repo.whatsapp(organizationId, since),
    Repo.sms(organizationId, since),
  ]);
  return buildBriefing({
    since,
    now,
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
}

export const BriefingService = { getBriefing };

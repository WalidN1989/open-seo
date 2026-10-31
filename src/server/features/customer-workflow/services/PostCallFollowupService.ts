import { ActionRepository } from "../repositories/ActionRepository";
import { BusinessModuleRepository } from "@/server/features/business-modules/repositories/BusinessModuleRepository";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { LeadDetailRepository } from "@/server/features/crm/repositories/LeadDetailRepository";
import { EmailSendService } from "@/server/features/email/services/EmailSendService";
import { CallRecapService } from "@/server/features/voice-calls/services/CallRecapService";
import { CallQuoteService } from "@/server/features/voice-calls/services/CallQuoteService";
import { CallWelcomeService } from "@/server/features/voice-calls/services/CallWelcomeService";
import { PhoneCallRepository as Calls } from "@/server/features/voice-calls/repositories/PhoneCallRepository";
import {
  emailFrom,
  phoneFromText,
  type PhoneCallReport,
} from "@/server/features/voice-calls/elevenlabsWebhook";
async function prepare(org: string, callId: string, kind: string) {
  const stamp = new Date().toISOString();
  await ActionRepository.ensure({
    id: `${callId}:${kind}`,
    organizationId: org,
    callId,
    kind,
    status: "pending",
    requestJson: "{}",
    requestedByUserId: "system:post-call",
    createdAt: stamp,
    updatedAt: stamp,
    expiresAt: new Date(Date.now() + 365 * 86400000).toISOString(),
  });
}
/** A durable claim is written BEFORE the provider call. Replayed webhooks cannot resend. */
async function once(
  org: string,
  callId: string,
  kind: string,
  attempt: () => Promise<string>,
) {
  const id = `${callId}:${kind}`;
  await prepare(org, callId, kind);
  const claimed = await ActionRepository.transition(org, id, ["pending"], {
    status: "sending",
  });
  if (!claimed) {
    const existing = await ActionRepository.get(org, id);
    if (existing?.resultJson) {
      const result: unknown = JSON.parse(existing.resultJson);
      if (typeof result === "string") return result;
    }
    return "unknown: previous follow-up is processing or needs review";
  }
  let result: string;
  try {
    result = await attempt();
  } catch {
    result =
      "unknown: follow-up interrupted; check provider history before retrying";
  }
  const ok =
    result.startsWith("sent") ||
    result.startsWith("drafted") ||
    result.startsWith("skipped: no quote requested");
  await ActionRepository.finish(org, id, {
    status: ok ? "completed" : "attention",
    resultJson: JSON.stringify(result),
    error: ok ? null : result,
  });
  return result;
}
async function run(input: {
  organizationId: string;
  callId: string;
  leadId: string | null;
  contactId: string | null;
  report: PhoneCallReport;
  welcomeTemplate: string | undefined;
}) {
  const org = input.organizationId;
  if (!input.leadId || !input.contactId) return;
  const [lead, owner] = await Promise.all([
    LeadDetailRepository.getLead(org, input.leadId),
    BusinessModuleRepository.findOwner(org),
  ]);
  if (!lead || !owner) throw new Error("Follow-up owner or lead unavailable");
  await BusinessModuleService.requireAccess(org, owner.userId, "voice");
  // Persist every expected step before any external side effect. A timeout then
  // leaves visible pending steps instead of silently losing the rest of the flow.
  await Promise.all(
    [
      "system_whatsapp_confirmation",
      "system_customer_confirmation",
      "system_quote_draft",
      "system_owner_summary",
    ].map((kind) => prepare(org, input.callId, kind)),
  );
  const firstName =
    lead.contact?.firstName || input.report.captured.caller_name || "there";
  const email =
    emailFrom(input.report.captured.caller_email) ??
    lead.contact?.email ??
    null;
  const pref = (input.report.captured.whatsapp_preference ?? "").toLowerCase();
  const consent =
    /yes|same|different|confirmed/.test(pref) &&
    !/no_whatsapp|no whatsapp|not|unavailable/.test(pref);
  const number =
    phoneFromText(input.report.captured.whatsapp_number, "AU") ??
    phoneFromText(input.report.captured.callback_details, "AU") ??
    input.report.callerNumber;
  const welcome = await once(
    org,
    input.callId,
    "system_whatsapp_confirmation",
    async () => {
      await BusinessModuleService.requireAccess(
        org,
        owner.userId,
        "whatsapp",
        "manage",
      );
      if (!consent) return "skipped: WhatsApp consent not confirmed";
      return CallWelcomeService.sendWelcome({
        organizationId: org,
        template: input.welcomeTemplate,
        enforceRules: true,
        recipient: number,
        contactId: input.contactId!,
        variables: {
          "1": firstName,
          "2": input.report.captured.service_interest ?? "your enquiry",
        },
      });
    },
  );
  await Calls.setWelcomeStatus(input.callId, welcome);
  const recapEmail = await once(
    org,
    input.callId,
    "system_customer_confirmation",
    async () => {
      await BusinessModuleService.requireAccess(
        org,
        owner.userId,
        "email",
        "manage",
      );
      return CallRecapService.sendCallRecap({
        organizationId: org,
        email,
        firstName,
        report: input.report,
      });
    },
  );
  await Calls.setRecapEmailStatus(input.callId, recapEmail);
  const quote = await once(org, input.callId, "system_quote_draft", () =>
    CallQuoteService.quoteFromCall({
      organizationId: org,
      leadId: input.leadId!,
      contactId: input.contactId!,
      clientName: [firstName, lead.contact?.lastName].filter(Boolean).join(" "),
      email,
      report: input.report,
    }),
  );
  await once(org, input.callId, "system_owner_summary", async () => {
    const sent = await EmailSendService.sendFromConnectedMailbox(org, {
      to: owner.email,
      subject: `Southside call — ${firstName}`,
      authoredBy: "system:post-call-summary",
      text: [
        `Caller: ${firstName}`,
        `Email: ${email ?? "not confirmed"}`,
        `WhatsApp: ${number ?? "not confirmed"}`,
        input.report.summary ?? "No summary captured.",
        `Customer email: ${recapEmail}`,
        `WhatsApp confirmation: ${welcome}`,
        `Quotation: ${quote}`,
        "Sent means provider accepted, not confirmed delivery. Review Reporting for delivery failures and pending approvals.",
      ].join("\n\n"),
    });
    return sent
      ? "sent: owner summary"
      : "failed: no connected mailbox for owner summary";
  });
}
export const PostCallFollowupService = { run, once };

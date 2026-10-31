import type { CallSource } from "./PhoneCallService";
import type { PhoneCallReport, PhoneRegion } from "../elevenlabsWebhook";
import { isSouthsideWorkflow } from "@/server/features/customer-workflow/policy";
import { BusinessAuditRepository } from "@/server/features/business-modules/repositories/BusinessAuditRepository";
import { PhoneCallRepository as Repo } from "../repositories/PhoneCallRepository";
import { phoneFromText, shortNeed } from "../elevenlabsWebhook";
import { inSentence } from "../callNotes";
import { CallBookLinkService } from "./CallBookLinkService";
import { CallWelcomeService } from "./CallWelcomeService";
import { CallRecapService } from "./CallRecapService";
import { CallQuoteService } from "./CallQuoteService";
function handlesBookLink(
  provider: CallSource["provider"],
  report: PhoneCallReport,
) {
  return (
    provider === "elevenlabs" &&
    Object.hasOwn(report.captured, "whatsapp_link_consent")
  );
}
async function journalOutreach(input: {
  organizationId: string;
  leadId: string;
  contactId: string;
  welcome: string;
  recapEmail: string;
}) {
  const occurredAt = new Date().toISOString();
  const entries = [
    {
      activityType: "whatsapp" as const,
      status: input.welcome,
      label: "WhatsApp thank-you",
    },
    {
      activityType: "email" as const,
      status: input.recapEmail,
      label: "Recap email",
    },
  ].filter((entry) => !entry.status.startsWith("skipped"));
  for (const entry of entries) {
    const sent = entry.status.startsWith("sent");
    await Repo.insertCallActivity({
      organizationId: input.organizationId,
      leadId: input.leadId,
      contactId: input.contactId,
      activityType: entry.activityType,
      subject: `${entry.label} ${sent ? "sent" : "failed"}`,
      notes: entry.status,
      outcome: sent ? "sent" : "failed",
      occurredAt,
    });
  }
}

export async function finishInbound(input: {
  source: CallSource;
  report: PhoneCallReport;
  callId: string;
  lead: NonNullable<Awaited<ReturnType<typeof Repo.findOpenLead>>>;
  contact: NonNullable<Awaited<ReturnType<typeof Repo.findContactByPhone>>>;
  firstTimeCaller: boolean;
  businessName: string | undefined;
  knownName: string;
  recapTo: string | null;
  phone: string | null;
  region: PhoneRegion;
}) {
  const {
    source,
    report,
    callId,
    lead,
    contact,
    firstTimeCaller,
    businessName,
    knownName,
    recapTo,
    region,
    phone,
  } = input;
  const { provider, organizationId, integrationId, welcomeTemplate } = source;

  if (await isSouthsideWorkflow(organizationId)) {
    const { PostCallFollowupService } =
      await import("@/server/features/customer-workflow/services/PostCallFollowupService");
    await PostCallFollowupService.run({
      organizationId,
      callId: callId,
      leadId: lead.id,
      contactId: contact.id,
      report,
      welcomeTemplate,
    });
    return { callId: callId, duplicate: false };
  }
  await CallBookLinkService.send(organizationId, integrationId, callId);

  // The number the caller read out is the one they asked us to use; the line
  // they rang from can be a landline or a phone without WhatsApp.
  const whatsappTo =
    phoneFromText(report.captured.callback_details, region) ?? phone;
  // Anyone who has not had the thank-you yet gets it, so a caller whose
  // first call came before a template was set up is not left out.
  const welcomeOwed = !(await Repo.welcomeSentTo(organizationId, contact.id));
  const welcome = handlesBookLink(provider, report)
    ? "skipped: book-link follow-up handled separately"
    : welcomeOwed
      ? await CallWelcomeService.sendWelcome({
          organizationId,
          template: welcomeTemplate,
          recipient: whatsappTo,
          contactId: contact.id,
          // Template: "Hi {{1}}, thanks for calling … about {{2}} …"
          variables: {
            "1": knownName || "there",
            "2": report.captured.service_interest
              ? inSentence(shortNeed(report.captured.service_interest))
              : "our services",
          },
        })
      : "skipped: already welcomed";
  await Repo.setWelcomeStatus(callId, welcome);
  const recapEmail = await CallRecapService.sendCallRecap({
    organizationId,
    email: recapTo,
    firstName: knownName,
    report,
  });
  await Repo.setRecapEmailStatus(callId, recapEmail);
  const quote = await CallQuoteService.quoteFromCall({
    organizationId,
    leadId: lead.id,
    contactId: contact.id,
    clientName:
      businessName ||
      [knownName, contact.lastName].filter(Boolean).join(" ") ||
      "Caller",
    email: recapTo,
    report,
  });
  await journalOutreach({
    organizationId,
    leadId: lead.id,
    contactId: contact.id,
    welcome,
    recapEmail,
  });

  await BusinessAuditRepository.record({
    organizationId,
    // No member acts on a webhook; the provider is the actor.
    actorUserId: `system:${provider}`,
    action: "voice.phone_call.recorded",
    targetType: "lead",
    targetId: lead.id,
    metadata: {
      callId: callId,
      provider,
      firstTimeCaller,
      welcome,
      recapEmail,
      quote,
    },
  });
  return { callId: callId, duplicate: false };
}

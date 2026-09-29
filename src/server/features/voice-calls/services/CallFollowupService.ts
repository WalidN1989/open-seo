import { SmsService } from "@/server/features/sms/services/SmsService";
import { inSentence } from "../callNotes";
import { callFollowupSms } from "../callFollowup";
import { shortNeed } from "../elevenlabsWebhook";
import { PhoneCallRepository as Repo } from "../repositories/PhoneCallRepository";
import { CallWelcomeService } from "./CallWelcomeService";

async function deliver(input: {
  organizationId: string;
  contactId: string;
  template: string | undefined;
  recipient: string | null;
  smsRecipient: string | null;
  smsAllowed: boolean;
  noWhatsapp: boolean;
  knownName: string;
  serviceInterest: string | undefined;
}) {
  const welcomeOwed = !(await Repo.welcomeSentTo(
    input.organizationId,
    input.contactId,
  ));
  if (!welcomeOwed) {
    return {
      welcome: "skipped: already welcomed",
      welcomeChannel: null,
    } as const;
  }

  let welcome = input.noWhatsapp
    ? "skipped: caller has no WhatsApp"
    : await CallWelcomeService.sendWelcome({
        organizationId: input.organizationId,
        template: input.template,
        recipient: input.recipient,
        contactId: input.contactId,
        // Template: "Hi {{1}}, thanks for calling … about {{2}} …"
        variables: {
          "1": input.knownName || "there",
          "2": input.serviceInterest
            ? inSentence(shortNeed(input.serviceInterest))
            : "our services",
        },
      });
  let welcomeChannel: "whatsapp" | "sms" | null =
    welcome === "sent" ? "whatsapp" : null;

  if (welcome !== "sent" && input.smsAllowed && input.smsRecipient) {
    try {
      await SmsService.sendAutomated(input.organizationId, {
        to: input.smsRecipient,
        body: callFollowupSms({
          firstName: input.knownName,
          serviceInterest: input.serviceInterest,
        }),
        source: "voice",
      });
      welcome = "sent via SMS";
      welcomeChannel = "sms";
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown error";
      welcome =
        `failed: SMS fallback: ${reason}; WhatsApp result: ${welcome}`.slice(
          0,
          300,
        );
      welcomeChannel = "sms";
    }
  } else if (welcome !== "sent" && input.noWhatsapp) {
    welcome = input.smsAllowed
      ? "skipped: no mobile number for SMS"
      : "skipped: caller declined WhatsApp and SMS";
  }

  return { welcome, welcomeChannel };
}

/** Put automatic follow-up outcomes on the lead timeline. */
async function journal(input: {
  organizationId: string;
  leadId: string;
  contactId: string;
  welcome: string;
  welcomeChannel: "whatsapp" | "sms" | null;
  recapEmail: string;
}) {
  const occurredAt = new Date().toISOString();
  const entries = [
    {
      activityType: input.welcomeChannel ?? ("whatsapp" as const),
      status: input.welcome,
      label:
        input.welcomeChannel === "sms" ? "SMS thank-you" : "WhatsApp thank-you",
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

export const CallFollowupService = { deliver, journal };

import { BusinessAuditRepository } from "@/server/features/business-modules/repositories/BusinessAuditRepository";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { CrmService } from "@/server/features/crm/services/CrmService";
import { decryptCredentials } from "@/server/lib/connection-secrets";
import {
  emailFrom,
  phoneFromText,
  phoneRegionOf,
  shortNeed,
  readPostCall,
  verifyElevenLabsSignature,
  type PhoneCallReport,
  type PhoneRegion,
} from "../elevenlabsWebhook";
import { activityNotes, duration, inSentence, splitName } from "../callNotes";
import { PhoneCallRepository as Repo } from "../repositories/PhoneCallRepository";
import { CallQuoteService } from "./CallQuoteService";
import { CallWelcomeService } from "./CallWelcomeService";
import { CallRecapService } from "./CallRecapService";

/**
 * Where a call came from: the phone line answered by an ElevenLabs agent, or
 * the website voice agent running on Deepgram. Stored on every call so the
 * log can tell the two apart.
 */
type CallProvider = "elevenlabs" | "deepgram";

/** Who took the call, for which business, and how to follow it up. */
type CallSource = {
  provider: CallProvider;
  organizationId: string;
  integrationId: string;
  welcomeTemplate: string | undefined;
  /** A website call has no line to read the country from; the site says it. */
  region?: PhoneRegion;
};

export type WebhookResult = { status: number; body: string };

/**
 * Put the WhatsApp and email the call set off into the lead's journal, so
 * whether they went out is visible on the lead rather than buried in the
 * call record. Skips are left out; a failure is worth seeing.
 */
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

/** The call log row; `links` is what the pipeline decided about the caller. */
function callRow(
  provider: CallProvider,
  organizationId: string,
  integrationId: string,
  report: PhoneCallReport,
  links: {
    callerNumber: string | null;
    contactId: string | null;
    leadId: string | null;
    welcomeStatus: string | null;
    recapEmailStatus: string | null;
  },
) {
  return {
    id: crypto.randomUUID(),
    organizationId,
    integrationId,
    provider,
    externalConversationId: report.conversationId,
    externalAgentId: report.agentId,
    agentName: report.agentName,
    direction: report.direction,
    calledNumber: report.calledNumber,
    startedAt: report.startedAt,
    durationSeconds: report.durationSeconds,
    summary: report.summary,
    callSuccessful: report.callSuccessful,
    capturedJson: JSON.stringify(report.captured),
    transcriptJson: JSON.stringify(report.transcript),
    ...links,
  };
}

async function recordCall(source: CallSource, report: PhoneCallReport) {
  const { provider, organizationId, integrationId, welcomeTemplate } = source;
  const existing = await Repo.findCall(organizationId, report.conversationId);
  if (existing) return { callId: existing.id, duplicate: true };

  const { firstName, lastName } = splitName(report.captured.caller_name);
  // A number said out loud has no country code, and which country it belongs
  // to is only knowable from the line they rang on.
  const region = source.region ?? phoneRegionOf(report.callerNumber);
  // Caller ID first; a web-widget call has none, and then the number the
  // caller gave out loud is the one to use.
  const phone =
    report.callerNumber ??
    phoneFromText(report.captured.callback_details, region);
  const email = emailFrom(report.captured.caller_email);
  const businessName = report.captured.business_name?.trim();

  // A website visitor who opens the widget and says nothing leaves no caller
  // ID, name, number or email. Keep the call in the log, but a CRM contact
  // and lead called "Caller" with no way to reach them is only clutter.
  if (!phone && !email && !report.captured.caller_name?.trim()) {
    const skipped = "skipped: nothing captured";
    const call = await Repo.insertCall(
      callRow(provider, organizationId, integrationId, report, {
        callerNumber: null,
        contactId: null,
        leadId: null,
        welcomeStatus: skipped,
        recapEmailStatus: skipped,
      }),
    );
    return { callId: call.id, duplicate: false };
  }

  const company = businessName
    ? await Repo.companyNamed(organizationId, businessName.slice(0, 200))
    : null;

  let contact =
    (phone ? await Repo.findContactByPhone(organizationId, phone) : null) ??
    (email ? await Repo.findContactByEmail(organizationId, email) : null);
  const firstTimeCaller = !contact;
  contact = contact
    ? await Repo.completeContact(contact, {
        phone,
        email,
        companyId: company?.id ?? null,
      })
    : await Repo.insertContact({
        organizationId,
        firstName,
        lastName,
        phone,
        email,
        companyId: company?.id ?? null,
      });

  // A returning caller who was recognised isn't asked their name or email
  // again, so what the CRM already holds fills the gaps.
  const knownName =
    report.captured.caller_name?.trim() || contact.firstName === "Caller"
      ? firstName
      : contact.firstName;
  const recapTo = email ?? contact.email;

  const occurredAt = report.startedAt ?? new Date().toISOString();
  let lead = await Repo.findOpenLead(organizationId, contact.id);
  if (!lead) {
    const stages = await CrmService.ensureStages(organizationId);
    lead = await Repo.insertLead({
      organizationId,
      contactId: contact.id,
      companyId: company?.id ?? null,
      stageId: stages.find((stage) => stage.stageType === "open")?.id ?? null,
      title: `${shortNeed(report.captured.service_interest)} — ${
        businessName || [firstName, lastName].filter(Boolean).join(" ")
      }`.slice(0, 200),
      notes: [
        report.summary,
        report.captured.service_interest
          ? `Needs: ${report.captured.service_interest}`
          : null,
        report.captured.caller_suburb
          ? `Location: ${report.captured.caller_suburb}`
          : null,
      ]
        .filter(Boolean)
        .join("\n\n"),
      nextAction: report.captured.callback_details
        ? `Call back: ${report.captured.callback_details}`.slice(0, 300)
        : "Call back",
    });
  }
  await Repo.insertCallActivity({
    organizationId,
    leadId: lead.id,
    contactId: contact.id,
    subject: `Inbound call${duration(report.durationSeconds)}`,
    notes: activityNotes(report),
    outcome: report.callSuccessful,
    occurredAt,
  });

  const call = await Repo.insertCall(
    callRow(provider, organizationId, integrationId, report, {
      callerNumber: phone,
      contactId: contact.id,
      leadId: lead.id,
      welcomeStatus: null,
      recapEmailStatus: null,
    }),
  );

  // The number the caller read out is the one they asked us to use; the line
  // they rang from can be a landline or a phone without WhatsApp.
  const whatsappTo =
    phoneFromText(report.captured.callback_details, region) ?? phone;
  // Anyone who has not had the thank-you yet gets it, so a caller whose
  // first call came before a template was set up is not left out.
  const welcomeOwed = !(await Repo.welcomeSentTo(organizationId, contact.id));
  const welcome = welcomeOwed
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
  await Repo.setWelcomeStatus(call.id, welcome);
  const recapEmail = await CallRecapService.sendCallRecap({
    organizationId,
    email: recapTo,
    firstName: knownName,
    report,
  });
  await Repo.setRecapEmailStatus(call.id, recapEmail);
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
      callId: call.id,
      provider,
      firstTimeCaller,
      welcome,
      recapEmail,
      quote,
    },
  });
  return { callId: call.id, duplicate: false };
}

/**
 * ElevenLabs posts here when a call ends. The connection id in the URL picks
 * the business and its webhook secret; nothing is read before the signature
 * checks out. Other event types are acknowledged so ElevenLabs does not
 * retry or disable the webhook.
 */
async function processElevenLabsWebhook(
  connectionId: string,
  headers: Headers,
  rawBody: string,
): Promise<WebhookResult> {
  const connection = await Repo.getIntegrationById(connectionId);
  if (
    !connection ||
    connection.providerKey !== "elevenlabs" ||
    connection.status !== "connected"
  ) {
    return { status: 404, body: "unknown connection" };
  }
  const credentials = await decryptCredentials(connection.credentials);
  const secret = credentials.WEBHOOK_SECRET;
  if (!secret) return { status: 410, body: "connection has no webhook secret" };
  const valid = await verifyElevenLabsSignature({
    secret,
    header: headers.get("elevenlabs-signature"),
    rawBody,
    nowSeconds: Math.floor(Date.now() / 1000),
  });
  if (!valid) return { status: 401, body: "bad signature" };

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: "unreadable body" };
  }
  const report = readPostCall(payload);
  if (!report) return { status: 200, body: "ignored" };

  const result = await recordCall(
    {
      provider: "elevenlabs",
      organizationId: connection.organizationId,
      integrationId: connection.id,
      welcomeTemplate: credentials.WELCOME_TEMPLATE,
    },
    report,
  );
  return { status: 200, body: result.duplicate ? "duplicate" : "recorded" };
}

async function listCalls(organizationId: string, userId: string) {
  await BusinessModuleService.requireAccess(organizationId, userId, "voice");
  const rows = await Repo.listCalls(organizationId);
  return rows.map(({ call, contact, lead }) => ({
    id: call.id,
    provider: call.provider,
    agentName: call.agentName,
    direction: call.direction,
    callerNumber: call.callerNumber,
    calledNumber: call.calledNumber,
    startedAt: call.startedAt ?? call.createdAt,
    durationSeconds: call.durationSeconds,
    summary: call.summary,
    callSuccessful: call.callSuccessful,
    captured: capturedFrom(call.capturedJson),
    transcript: transcriptFrom(call.transcriptJson),
    welcomeStatus: call.welcomeStatus,
    recapEmailStatus: call.recapEmailStatus,
    contact: contact
      ? {
          id: contact.id,
          name: [contact.firstName, contact.lastName].filter(Boolean).join(" "),
        }
      : null,
    lead: lead ? { id: lead.id, title: lead.title, status: lead.status } : null,
  }));
}

function capturedFrom(json: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

function transcriptFrom(json: string): PhoneCallReport["transcript"] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((turn: unknown) => {
      if (!turn || typeof turn !== "object") return [];
      const role = "role" in turn ? turn.role : null;
      const message = "message" in turn ? turn.message : null;
      const atSeconds = "atSeconds" in turn ? turn.atSeconds : null;
      if (typeof role !== "string" || typeof message !== "string") return [];
      return [
        {
          role,
          message,
          atSeconds: typeof atSeconds === "number" ? atSeconds : null,
        },
      ];
    });
  } catch {
    return [];
  }
}

export const PhoneCallService = {
  processElevenLabsWebhook,
  recordCall,
  listCalls,
};

import { finishInbound } from "./InboundFollowupService";
import { isSouthsideWorkflow } from "@/server/features/customer-workflow/policy";
import { CaseRepository } from "@/server/features/voice-cases/repositories/CaseRepository";
import { CallBookLinkService } from "./CallBookLinkService";
import { CrmService } from "@/server/features/crm/services/CrmService";
import { decryptCredentials } from "@/server/lib/connection-secrets";
import {
  emailFrom,
  phoneFromText,
  phoneRegionOf,
  shortNeed,
  readPostCall,
  readOutboundFailure,
  verifyElevenLabsSignature,
  type PhoneCallReport,
  type PhoneRegion,
} from "../elevenlabsWebhook";
import { activityNotes, duration, splitName } from "../callNotes";
import { PhoneCallRepository as Repo } from "../repositories/PhoneCallRepository";
import { listCalls } from "./storedCalls";

/**
 * Where a call came from: the phone line answered by an ElevenLabs agent, or
 * the website voice agent running on Deepgram. Stored on every call so the
 * log can tell the two apart.
 */
type CallProvider = "elevenlabs" | "deepgram";

/** Who took the call, for which business, and how to follow it up. */
export type CallSource = {
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
    recordingUrl: report.recordingUrl ?? null,
    capturedJson: JSON.stringify(report.captured),
    transcriptJson: JSON.stringify(report.transcript),
    ...links,
  };
}

/** Outbound callbacks are storage only: no lead, welcome, quote or AI recap. */
async function recordOutbound(source: CallSource, report: PhoneCallReport) {
  const { organizationId, integrationId, provider } = source;
  if (
    report.caseId &&
    !(await CaseRepository.linkCall(
      organizationId,
      report.caseId,
      report.conversationId,
    ))
  ) {
    throw new Error("Invalid or conflicting case reference.");
  }
  const existing = await Repo.findCall(organizationId, report.conversationId);
  if (existing) {
    if (await isSouthsideWorkflow(organizationId)) {
      const { CallbackService } =
        await import("@/server/features/customer-workflow/services/CallbackService");
      await CallbackService.complete(organizationId, report);
    }
    return { callId: existing.id, duplicate: true };
  }
  const contact = report.calledNumber
    ? await Repo.findCalleeByPhone(organizationId, report.calledNumber)
    : null;
  const call = await Repo.insertCall(
    callRow(provider, organizationId, integrationId, report, {
      callerNumber: report.callerNumber,
      contactId: contact?.id ?? null,
      leadId: null,
      welcomeStatus: "skipped: outbound log only",
      recapEmailStatus: "skipped: outbound log only",
    }),
    { deduplicate: true },
  );
  if (await isSouthsideWorkflow(organizationId)) {
    const { CallbackService } =
      await import("@/server/features/customer-workflow/services/CallbackService");
    await CallbackService.complete(organizationId, report);
  }
  return { callId: call.id, duplicate: false };
}

async function recordCall(source: CallSource, report: PhoneCallReport) {
  return report.direction === "outbound"
    ? recordOutbound(source, report)
    : recordInbound(source, report);
}

async function recordInbound(source: CallSource, report: PhoneCallReport) {
  const { provider, organizationId, integrationId, welcomeTemplate } = source;
  const existing = await Repo.findCall(organizationId, report.conversationId);
  if (existing) {
    if (await isSouthsideWorkflow(organizationId)) {
      const { PostCallFollowupService } =
        await import("@/server/features/customer-workflow/services/PostCallFollowupService");
      await PostCallFollowupService.run({
        organizationId,
        callId: existing.id,
        leadId: existing.leadId,
        contactId: existing.contactId,
        report,
        welcomeTemplate,
      });
      return { callId: existing.id, duplicate: true };
    }
    await CallBookLinkService.send(organizationId, integrationId, existing.id);
    return { callId: existing.id, duplicate: true };
  }

  const { firstName, lastName } = splitName(report.captured.caller_name);
  // Prefer the caller's explicit country, then the line they called, then
  // the workspace. Widget calls often have no telephone metadata at all.
  const fallback =
    source.region ?? (await Repo.defaultPhoneRegion(organizationId));
  const region = phoneRegionOf(
    report.callerNumber,
    phoneRegionOf(report.calledNumber, fallback),
  );
  // Caller ID first; a web-widget call has none, and then the number the
  // caller gave out loud is the one to use.
  const phone =
    report.callerNumber ??
    phoneFromText(report.captured.callback_details, region) ??
    phoneFromText(report.captured.customer_phone_number, region);
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

  return finishInbound({
    source,
    report,
    callId: call.id,
    lead,
    contact,
    firstTimeCaller,
    businessName,
    knownName,
    recapTo,
    region,
    phone,
  });
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
  outboundOnly = false,
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
  const region = await Repo.defaultPhoneRegion(connection.organizationId);
  const report =
    readPostCall(payload, region) ?? readOutboundFailure(payload, region);
  if (!report) return { status: 200, body: "ignored" };
  if (outboundOnly && report.direction !== "outbound")
    return { status: 400, body: "outbound call required" };

  const result = await recordCall(
    {
      provider: "elevenlabs",
      organizationId: connection.organizationId,
      integrationId: connection.id,
      welcomeTemplate: credentials.WELCOME_TEMPLATE,
      region,
    },
    report,
  );
  return { status: 200, body: result.duplicate ? "duplicate" : "recorded" };
}

export const PhoneCallService = {
  processElevenLabsWebhook,
  recordCall,
  listCalls,
};

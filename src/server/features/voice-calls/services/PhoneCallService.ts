import { BusinessAuditRepository } from "@/server/features/business-modules/repositories/BusinessAuditRepository";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { sendWhatsappTemplate } from "@/server/features/communications/providers/whatsapp";
import { CrmService } from "@/server/features/crm/services/CrmService";
import { decryptCredentials } from "@/server/lib/connection-secrets";
import {
  emailFrom,
  phoneFromText,
  shortNeed,
  readPostCall,
  verifyElevenLabsSignature,
  type PhoneCallReport,
} from "../elevenlabsWebhook";
import { PhoneCallRepository as Repo } from "../repositories/PhoneCallRepository";

const PROVIDER = "elevenlabs";

type WebhookResult = { status: number; body: string };

function duration(seconds: number | null) {
  if (!seconds) return "";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return minutes ? ` (${minutes}m ${rest}s)` : ` (${rest}s)`;
}

function splitName(raw: string | undefined) {
  const cleaned = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!cleaned) return { firstName: "Caller", lastName: null };
  const [first, ...rest] = cleaned.split(" ");
  return { firstName: first ?? "Caller", lastName: rest.join(" ") || null };
}

function label(key: string) {
  return key
    .replace(/^caller_/, "")
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

/** The activity note a person reads on the lead. */
function activityNotes(report: PhoneCallReport) {
  const lines: string[] = [];
  if (report.summary) lines.push(report.summary, "");
  const captured = Object.entries(report.captured);
  if (captured.length) {
    lines.push("Captured on the call:");
    for (const [key, value] of captured)
      lines.push(`- ${label(key)}: ${value}`);
    lines.push("");
  }
  if (report.callerNumber)
    lines.push(`Caller number: ${report.callerNumber}`, "");
  if (report.transcript.length) {
    lines.push("Transcript:");
    for (const turn of report.transcript) {
      lines.push(
        `${turn.role === "agent" ? "Agent" : "Caller"}: ${turn.message}`,
      );
    }
  }
  return lines.join("\n").slice(0, 20_000);
}

/** "Website design" reads as "website design" mid-sentence; "SEO" stays. */
function inSentence(phrase: string) {
  return /^[A-Z][a-z]/.test(phrase)
    ? phrase[0].toLowerCase() + phrase.slice(1)
    : phrase;
}

/**
 * Send the configured WhatsApp welcome to a first-time caller. A template is
 * required: the business has never messaged this person, so WhatsApp allows
 * nothing else. Returns what happened, for the call record.
 */
async function sendWelcome(
  organizationId: string,
  template: string | undefined,
  recipient: string | null,
  variables: Record<string, string>,
) {
  if (!template?.trim()) return "skipped: no welcome template configured";
  if (!recipient) return "skipped: no caller number";
  const connection = await Repo.connectedWhatsapp(organizationId);
  if (!connection) return "skipped: no connected WhatsApp sender";
  const value = template.trim();
  // Twilio sends by Content SID (HX…); Meta sends by template name.
  const isContentSid = /^HX[0-9a-f]{32}$/i.test(value);
  const send = (withVariables: boolean) =>
    sendWhatsappTemplate(
      connection,
      connection.provider === "twilio"
        ? recipient
        : recipient.replace(/^\+/, ""),
      {
        name: isContentSid ? "call_welcome" : value,
        languageCode: "en",
        externalTemplateId: isContentSid ? value : null,
        variables: withVariables ? variables : undefined,
      },
    );
  try {
    try {
      await send(isContentSid);
    } catch (error) {
      // A template without placeholders can refuse the name and service;
      // the plain template is still the right message.
      if (!isContentSid) throw error;
      await send(false);
    }
    return "sent";
  } catch (error) {
    return `failed: ${error instanceof Error ? error.message : "unknown error"}`.slice(
      0,
      300,
    );
  }
}

async function recordCall(
  organizationId: string,
  integrationId: string,
  report: PhoneCallReport,
  welcomeTemplate: string | undefined,
) {
  const existing = await Repo.findCall(organizationId, report.conversationId);
  if (existing) return { callId: existing.id, duplicate: true };

  const { firstName, lastName } = splitName(report.captured.caller_name);
  // Caller ID first; a web-widget call has none, and then the number the
  // caller gave out loud is the one to use.
  const phone =
    report.callerNumber ?? phoneFromText(report.captured.callback_details);
  const email = emailFrom(report.captured.caller_email);
  const businessName = report.captured.business_name?.trim();
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

  const call = await Repo.insertCall({
    id: crypto.randomUUID(),
    organizationId,
    integrationId,
    provider: PROVIDER,
    externalConversationId: report.conversationId,
    externalAgentId: report.agentId,
    agentName: report.agentName,
    direction: report.direction,
    callerNumber: phone,
    calledNumber: report.calledNumber,
    startedAt: report.startedAt,
    durationSeconds: report.durationSeconds,
    summary: report.summary,
    callSuccessful: report.callSuccessful,
    capturedJson: JSON.stringify(report.captured),
    transcriptJson: JSON.stringify(report.transcript),
    contactId: contact.id,
    leadId: lead.id,
    welcomeStatus: null,
  });

  // The number the caller read out is the one they asked us to use; the line
  // they rang from can be a landline or a phone without WhatsApp.
  const whatsappTo = phoneFromText(report.captured.callback_details) ?? phone;
  // Anyone who has not had the thank-you yet gets it, so a caller whose
  // first call came before a template was set up is not left out.
  const welcomeOwed = !(await Repo.welcomeSentTo(organizationId, contact.id));
  const welcome = welcomeOwed
    ? await sendWelcome(organizationId, welcomeTemplate, whatsappTo, {
        // Template: "Hi {{1}}, thanks for calling … about {{2}} …"
        "1": firstName || "there",
        "2": report.captured.service_interest
          ? inSentence(shortNeed(report.captured.service_interest))
          : "our services",
      })
    : "skipped: already welcomed";
  await Repo.setWelcomeStatus(call.id, welcome);

  await BusinessAuditRepository.record({
    organizationId,
    // No member acts on a webhook; the provider is the actor.
    actorUserId: "system:elevenlabs",
    action: "voice.phone_call.recorded",
    targetType: "lead",
    targetId: lead.id,
    metadata: {
      callId: call.id,
      provider: PROVIDER,
      firstTimeCaller,
      welcome,
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
    connection.providerKey !== PROVIDER ||
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
    connection.organizationId,
    connection.id,
    report,
    credentials.WELCOME_TEMPLATE,
  );
  return { status: 200, body: result.duplicate ? "duplicate" : "recorded" };
}

async function listCalls(organizationId: string, userId: string) {
  await BusinessModuleService.requireAccess(organizationId, userId, "voice");
  const rows = await Repo.listCalls(organizationId);
  return rows.map(({ call, contact, lead }) => ({
    id: call.id,
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

export const PhoneCallService = { processElevenLabsWebhook, listCalls };

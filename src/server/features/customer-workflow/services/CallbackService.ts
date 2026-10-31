import { ActionRepository } from "../repositories/ActionRepository";
import { customerActionSchema } from "@/types/schemas/customerActions";
import { CrmService } from "@/server/features/crm/services/CrmService";
import {
  emailFrom,
  type PhoneCallReport,
} from "@/server/features/voice-calls/elevenlabsWebhook";
import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import { resolveConnectionCredential } from "@/server/lib/connection-secrets";
import { CommunicationsRepository } from "@/server/features/communications/repositories/CommunicationsRepository";
import { LeadDetailRepository } from "@/server/features/crm/repositories/LeadDetailRepository";
const resultSchema = z.object({
  success: z.boolean(),
  conversation_id: z.string().nullable().optional(),
  callSid: z.string().nullable().optional(),
});
/** Called only after a durable single-use owner approval has been claimed. */
async function start(
  organizationId: string,
  userId: string,
  input: { leadId: string; phone: string; reason: string },
) {
  const connection = await CommunicationsRepository.getIntegrationByProvider(
    organizationId,
    "elevenlabs",
  );
  const lead = await LeadDetailRepository.getLead(organizationId, input.leadId);
  if (!connection || connection.status !== "connected" || !lead)
    throw new AppError(
      "VALIDATION_ERROR",
      "Connected ElevenLabs agent and lead required.",
    );
  const key = await resolveConnectionCredential(connection, "API_KEY");
  // The dedicated callback agent must be configured before activation. Never repurpose the inbound agent with a client-supplied prompt.
  const agentId = await resolveConnectionCredential(
    connection,
    "CALLBACK_AGENT_ID",
  );
  const phoneId = await resolveConnectionCredential(
    connection,
    "OUTBOUND_PHONE_NUMBER_ID",
  );
  if (!agentId || !phoneId)
    throw new AppError(
      "VALIDATION_ERROR",
      "Configure the email-correction callback agent and outbound phone line first.",
    );
  const response = await fetch(
    "https://api.elevenlabs.io/v1/convai/twilio/outbound-call",
    {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        agent_id: agentId,
        agent_phone_number_id: phoneId,
        to_number: input.phone,
        conversation_initiation_client_data: {
          dynamic_variables: {
            customer_name: lead.contact?.firstName ?? "",
            customer_email: lead.contact?.email ?? "",
            callback_reason: input.reason,
          },
        },
      }),
    },
  );
  if (!response.ok) throw new Error("Callback provider rejected the request.");
  const result = resultSchema.parse(await response.json());
  if (!result.success) throw new Error("Callback was not confirmed.");
  return {
    status: "initiated",
    conversationId: result.conversation_id ?? null,
    providerCallId: result.callSid ?? null,
  };
}
/** A callback can correct only its approved lead and confirmed destination. Resends need a separate approval. */
async function complete(organizationId: string, report: PhoneCallReport) {
  const request = await ActionRepository.callbackFor(
    organizationId,
    report.conversationId,
  );
  if (!request?.approvedByUserId) return;
  const prior = z
    .object({ status: z.string() })
    .safeParse(JSON.parse(request.resultJson ?? "{}"));
  if (prior.success && prior.data.status === "contact_corrected") return;
  const saved = z
    .object({ action: customerActionSchema })
    .parse(JSON.parse(request.requestJson));
  if (
    saved.action.kind !== "callback" ||
    report.calledNumber !== saved.action.phone
  )
    return;
  const lead = await LeadDetailRepository.getLead(
    organizationId,
    saved.action.leadId,
  );
  const email =
    report.captured.email_confirmed?.trim().toLowerCase() === "yes"
      ? emailFrom(report.captured.caller_email)
      : null;
  if (!lead?.contact || !email) {
    await ActionRepository.completeCallback(
      organizationId,
      request.id,
      JSON.stringify({
        status: "needs_attention",
        conversationId: report.conversationId,
        reason: "No confirmed corrected email was captured.",
        callOutcome: report.callSuccessful,
      }),
    );
    return;
  }
  await CrmService.updateContact(organizationId, request.approvedByUserId, {
    id: lead.contact.id,
    email,
  });
  await CrmService.createActivity(organizationId, request.approvedByUserId, {
    leadId: saved.action.leadId,
    contactId: lead.contact.id,
    activityType: "call",
    subject: "Email confirmed on approved callback",
    notes:
      "Customer-confirmed email corrected. Resending a confirmation or quote requires a new approval.",
  });
  await ActionRepository.completeCallback(
    organizationId,
    request.id,
    JSON.stringify({
      status: "contact_corrected",
      conversationId: report.conversationId,
      correctedEmail: email,
      next: "Prepare the corrected confirmation or quote for a separate owner approval. Nothing resent automatically.",
    }),
  );
}
export const CallbackService = { start, complete };

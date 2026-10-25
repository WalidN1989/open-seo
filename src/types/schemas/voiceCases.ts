import { z } from "zod";

const caseStatusSchema = z.enum([
  "open",
  "umi_called",
  "umi_agreed",
  "waiting_crm_update",
  "closed",
]);
const reference = z.string().min(1).max(200).nullable().optional();
const caseFieldsSchema = z.object({
  customerName: z.string().trim().min(1).max(200),
  customerNumber: z.string().trim().max(40).nullable().optional(),
  contactId: reference,
  leadId: reference,
  sourceCallId: reference.describe(
    "Internal app call ID from list_calls/get_call, not the ElevenLabs conversation ID.",
  ),
  whatsappConversationId: reference.describe(
    "App WhatsApp chat ID; mode/resolution/human replies flag this case ready to close.",
  ),
  smsConversationId: reference,
  orderId: reference.describe(
    "Explicit app order ID. Required for the order-update ready-to-close helper; orderOrTrackingNumber alone is display text.",
  ),
  orderOrTrackingNumber: z.string().max(200).nullable().optional(),
  reason: z.string().trim().min(1).max(500),
  status: caseStatusSchema.optional(),
  callAttempts: z.number().int().min(0).max(100000).optional(),
  reminderCount: z.number().int().min(0).max(100000).optional(),
  lastContactTime: z.iso.datetime({ offset: true }).nullable().optional(),
  lastOutcome: z.string().max(500).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
});
export const createCaseSchema = caseFieldsSchema.extend({
  // Caller-chosen ID makes a retried create safe without creating a second case.
  id: z.string().uuid().optional(),
});
export const updateCaseSchema = caseFieldsSchema.partial().extend({
  caseId: z.string().min(1).max(200),
  externalConversationId: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe(
      "Exact ElevenLabs conversation_id, including before its webhook arrives. A conversation can belong to only one case.",
    ),
});
export const listCasesSchema = z.object({
  status: caseStatusSchema.optional(),
  caseId: z.string().min(1).max(200).optional(),
  limit: z.number().int().min(1).max(50).default(20),
  after: z.string().max(200).optional(),
});
export const attentionInputSchema = z.object({
  since: z.iso.datetime({ offset: true }).optional(),
  cursor: z.string().min(1).max(2000).optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

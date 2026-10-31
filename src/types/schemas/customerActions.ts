import { z } from "zod";
const copies = {
  cc: z.array(z.email()).max(10).optional(),
  bcc: z.array(z.email()).max(10).optional(),
};
const body = z.string().trim().min(1).max(20000);
const id = z.string().min(1).max(200);
export const customerActionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("email"),
      to: z.email(),
      subject: z.string().min(1).max(200),
      text: body,
      ...copies,
    })
    .strict(),
  z
    .object({
      kind: z.literal("email_reply"),
      threadId: id,
      text: body,
      ...copies,
    })
    .strict(),
  z
    .object({
      kind: z.literal("whatsapp"),
      conversationId: id,
      body: body.max(1000),
    })
    .strict(),
  z
    .object({
      kind: z.literal("whatsapp_template"),
      conversationId: id,
      templateId: id,
      variables: z.record(z.string(), z.string()).optional(),
    })
    .strict(),
  z
    .object({ kind: z.literal("sms"), conversationId: id, body: body.max(480) })
    .strict(),
  z
    .object({
      kind: z.literal("quote"),
      quoteId: id,
      to: z.email().optional(),
      message: body.optional(),
    })
    .strict(),
  z.object({ kind: z.literal("lead_stage"), leadId: id, stageId: id }).strict(),
  z
    .object({
      kind: z.literal("callback"),
      leadId: id,
      phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
      reason: z.string().min(1).max(1000),
    })
    .strict(),
]);
export type CustomerAction = z.infer<typeof customerActionSchema>;

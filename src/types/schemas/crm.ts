import { z } from "zod";

export const leadPrioritySchema = z.enum(["low", "medium", "high", "urgent"]);
export const createLeadSchema = z.object({
  title: z.string().trim().min(1).max(200),
  source: z.string().trim().max(100).optional(),
  priority: leadPrioritySchema.default("medium"),
  valueCents: z.number().int().min(0).max(1_000_000_000).default(0),
  contactId: z.string().min(1).optional(),
  companyId: z.string().min(1).optional(),
  stageId: z.string().min(1).optional(),
  assignedMemberId: z.string().min(1).optional(),
  nextAction: z.string().trim().max(300).optional(),
  nextActionDue: z.string().datetime().optional(),
  notes: z.string().trim().max(10_000).optional(),
});
export const updateLeadSchema = createLeadSchema.partial().extend({
  id: z.string().min(1),
  status: z.string().trim().min(1).max(50).optional(),
  leadScore: z.number().int().min(0).max(100).optional(),
  lostReason: z.string().trim().max(500).optional().nullable(),
});
export const createContactSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().max(100).optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional(),
  whatsappPhone: z.string().trim().max(40).optional(),
  companyId: z.string().min(1).optional(),
});
export const createCompanySchema = z.object({
  name: z.string().trim().min(1).max(200),
  website: z.string().trim().max(500).optional(),
  phone: z.string().trim().max(40).optional(),
});
export const createActivitySchema = z.object({
  leadId: z.string().min(1),
  contactId: z.string().min(1).optional(),
  activityType: z.enum([
    "note",
    "call",
    "email",
    "meeting",
    "whatsapp",
    "task",
  ]),
  subject: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(10_000).optional(),
  outcome: z.string().trim().max(100).optional(),
  occurredAt: z.string().datetime().optional(),
});
export const createInquirySchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(10_000).optional(),
  product: z.string().trim().max(200).optional(),
  targetValueCents: z.number().int().min(0).max(1_000_000_000).default(0),
});
export const promoteInquirySchema = z.object({
  inquiryId: z.string().min(1),
  assignedMemberId: z.string().min(1).optional(),
  priority: leadPrioritySchema.default("medium"),
});
export const createMeetingSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    leadId: z.string().min(1).optional(),
    assignedMemberId: z.string().min(1).optional(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime().optional(),
    location: z.string().trim().max(300).optional(),
    meetingUrl: z.url().max(2048).optional().or(z.literal("")),
    notes: z.string().trim().max(10_000).optional(),
  })
  .refine(
    (value) => !value.endsAt || value.endsAt >= value.startsAt,
    "Meeting end must be after its start.",
  );

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
export type CreateContactInput = z.infer<typeof createContactSchema>;
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
export type CreateActivityInput = z.infer<typeof createActivitySchema>;
export type CreateInquiryInput = z.infer<typeof createInquirySchema>;
export type PromoteInquiryInput = z.infer<typeof promoteInquirySchema>;
export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;

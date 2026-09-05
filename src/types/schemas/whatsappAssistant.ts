import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional();

const clockTime = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM, e.g. 09:00")
  .or(z.literal(""))
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .optional();

export const ASSISTANT_MODELS = [
  "claude-haiku-4-5-20251001",
  "claude-sonnet-5",
  "claude-opus-5",
] as const;

export const updateAssistantSettingsSchema = z.object({
  autopilot: z.boolean().optional(),
  model: z.enum(ASSISTANT_MODELS).nullable().optional(),
  replyDelaySeconds: z.number().int().min(0).max(8).optional(),
  bookingLink: optionalText(500),
  timezone: optionalText(80),
  businessHoursStart: clockTime,
  businessHoursEnd: clockTime,
  escalationKeywords: optionalText(2000),
  handoffMessage: optionalText(1000),
  persona: optionalText(6000),
  businessFacts: optionalText(12000),
});

export const createInstantAnswerSchema = z.object({
  question: z.string().trim().min(3).max(300),
  answer: z.string().trim().min(1).max(2000),
});

export const updateInstantAnswerSchema = z.object({
  id: z.string().min(1),
  question: z.string().trim().min(3).max(300).optional(),
  answer: z.string().trim().min(1).max(2000).optional(),
  enabled: z.boolean().optional(),
});

export const deleteByIdSchema = z.object({ id: z.string().min(1) });

export const ASKED_QUESTION_STATUSES = [
  "new",
  "drafting",
  "published",
] as const;

export const updateAskedQuestionSchema = z.object({
  id: z.string().min(1),
  blogUrl: z
    .string()
    .trim()
    .max(500)
    .refine(
      (value) => value === "" || /^https:\/\/\S+$/i.test(value),
      "Use a full https:// link",
    )
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional(),
  status: z.enum(ASKED_QUESTION_STATUSES).optional(),
});

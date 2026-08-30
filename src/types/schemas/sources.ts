import { z } from "zod";

const sourceProviderSchema = z.enum(["apify", "firecrawl", "manual"]);

export const startSourceRunSchema = z.object({
  provider: sourceProviderSchema,
  query: z.string().trim().min(2).max(200),
  location: z.string().trim().max(120).optional(),
  limit: z.number().int().min(1).max(100).default(25),
});

export const listCandidatesSchema = z.object({
  runId: z.string().min(1).optional(),
  status: z.enum(["new", "reviewing", "promoted", "rejected"]).optional(),
  limit: z.number().int().min(1).max(200).default(100),
});

export const promoteCandidateSchema = z.object({
  candidateId: z.string().min(1),
  stageId: z.string().min(1).optional(),
  assignedMemberId: z.string().min(1).optional(),
  reviewedByMemberId: z.string().min(1).optional(),
});

export const rejectCandidateSchema = z.object({
  candidateId: z.string().min(1),
  reason: z.string().trim().max(300).optional(),
  reviewedByMemberId: z.string().min(1).optional(),
});

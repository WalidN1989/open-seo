import { z } from "zod";

/** projectId travels in the payload: that is how requireProjectContext resolves. */
export const projectScopedSchema = z.object({
  projectId: z.string().min(1),
});

export const trackCompetitorSchema = z.object({
  projectId: z.string().min(1),
  domain: z.string().trim().min(3).max(255),
  name: z.string().trim().max(160).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const untrackCompetitorSchema = z.object({
  projectId: z.string().min(1),
  domain: z.string().trim().min(1).max(255),
});

export const competitorEvidenceSchema = z.object({
  projectId: z.string().min(1),
  keyword: z.string().trim().min(1).max(255),
});

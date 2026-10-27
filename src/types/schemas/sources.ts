import { z } from "zod";

const sourceProviderSchema = z.enum(["apify", "firecrawl", "manual"]);

const httpUrl = z
  .url()
  .refine((value) => /^https?:\/\//i.test(value), "Use an HTTP or HTTPS URL.");
export const createProspectSchema = z.object({
  companyName: z.string().trim().min(1).max(200),
  contactName: z.string().trim().max(120).optional(),
  email: z.email().optional(),
  phone: z.string().trim().max(60).optional(),
  website: httpUrl.optional(),
  profileUrl: httpUrl.optional(),
  category: z.string().trim().max(120).optional(),
  country: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(3000).optional(),
});

export const refreshSourceRunSchema = z.object({
  runId: z.string().min(1).max(100),
});

export const startSourceRunSchema = z.object({
  provider: sourceProviderSchema,
  query: z.string().trim().min(2).max(200),
  location: z.string().trim().max(120).optional(),
  limit: z.number().int().min(1).max(100).default(25),
  mapsUrls: z
    .array(
      httpUrl.refine((value) => {
        const host = new URL(value).hostname;
        return (
          host === "maps.app.goo.gl" ||
          host === "maps.google.com" ||
          host === "www.google.com" ||
          host === "google.com"
        );
      }, "Use a Google Maps link."),
    )
    .max(20)
    .optional(),
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
});

export const rejectCandidateSchema = z.object({
  candidateId: z.string().min(1),
  reason: z.string().trim().max(300).optional(),
});

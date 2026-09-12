import { z } from "zod";

export const generateClientReportSchema = z.object({
  projectId: z.string().min(1),
  clientName: z.string().trim().max(160).default(""),
  /** The address the client signs in with. Never a password. */
  loginEmail: z.string().trim().max(200).default(""),
  /**
   * Services set up for the business rather than the project, so nothing in
   * the database can tell us — the person generating the report says.
   */
  googleBusinessProfile: z.boolean().default(false),
  googleReviews: z.boolean().default(false),
  whatsappAssistant: z.boolean().default(false),
  sitemap: z.boolean().default(false),
  tagManager: z.boolean().default(false),
  emailMarketing: z.boolean().default(false),
  /** Social profiles: the address, and whether we run it for them. */
  facebookUrl: z.string().trim().max(300).default(""),
  facebookManaged: z.boolean().default(false),
  instagramUrl: z.string().trim().max(300).default(""),
  instagramManaged: z.boolean().default(false),
  /** Their Google review link, e.g. https://g.page/r/…/review. */
  googleReviewUrl: z.string().trim().max(300).default(""),
  /** Our own words. Kept short enough to fit a page. */
  recommendations: z.string().trim().max(4000).default(""),
  /**
   * A closing summary for a client who has been with us a while — usually
   * pasted from an agent's read of the account. Empty for a new client.
   */
  conclusion: z.string().trim().max(8000).default(""),
});

export const clientReportIdSchema = z.object({
  reportId: z.string().min(1),
});

export const clientReportTokenSchema = z.object({
  token: z.string().min(1),
});

export const clientReportProfileSchema = z.object({
  projectId: z.string().min(1),
});

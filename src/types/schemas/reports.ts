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
  whatsappAssistant: z.boolean().default(false),
});

export const clientReportIdSchema = z.object({
  reportId: z.string().min(1),
});

export const clientReportTokenSchema = z.object({
  token: z.string().min(1),
});

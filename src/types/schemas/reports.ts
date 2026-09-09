import { z } from "zod";

export const generateClientReportSchema = z.object({
  projectId: z.string().min(1),
  clientName: z.string().trim().max(160).default(""),
});

export const clientReportIdSchema = z.object({
  reportId: z.string().min(1),
});

export const clientReportTokenSchema = z.object({
  token: z.string().min(1),
});

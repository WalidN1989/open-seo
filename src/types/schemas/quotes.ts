import { z } from "zod";

export const QUOTE_STATUSES = [
  "draft",
  "sent",
  "accepted",
  "declined",
  "expired",
] as const;
export const quoteStatusSchema = z.enum(QUOTE_STATUSES);
export type QuoteStatus = z.infer<typeof quoteStatusSchema>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");

const quoteLineSchema = z.object({
  productId: z.string().min(1).nullish(),
  description: z.string().min(1).max(300),
  detail: z.string().max(1000).nullish(),
  quantityMilli: z.number().int().min(1).max(1_000_000).default(1000),
  unitPriceMinor: z.number().int().min(0).max(100_000_000).default(0),
});

export const saveQuoteSchema = z.object({
  quoteId: z.string().min(1).nullish(),
  leadId: z.string().min(1).nullish(),
  title: z.string().max(200).nullish(),
  clientName: z.string().min(1).max(200),
  clientAddressLines: z.string().max(600).nullish(),
  clientEmail: z.string().max(200).nullish(),
  clientTaxIdLabel: z.string().max(60).nullish(),
  clientTaxIdValue: z.string().max(60).nullish(),
  currency: z.string().min(3).max(3).default("AUD"),
  issueDate: isoDate,
  validUntil: isoDate,
  notes: z.string().max(2000).nullish(),
  terms: z.string().max(2000).nullish(),
  lines: z.array(quoteLineSchema).min(1).max(50),
});
export type SaveQuoteInput = z.infer<typeof saveQuoteSchema>;

export const quoteIdSchema = z.object({ quoteId: z.string().min(1) });
export const quoteLeadSchema = z.object({ leadId: z.string().min(1) });

export const setQuoteStatusSchema = z.object({
  quoteId: z.string().min(1),
  status: quoteStatusSchema,
});

export const quoteDocumentTokenSchema = z.object({
  token: z.string().min(1).max(4000),
});

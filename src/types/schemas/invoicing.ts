import { z } from "zod";

export const invoiceStatusSchema = z.enum(["draft", "sent", "paid", "void"]);
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;

export const invoiceDocumentTypeSchema = z.enum([
  "invoice",
  "proforma",
  "credit_note",
]);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");

export const invoiceSettingsSchema = z.object({
  legalName: z.string().max(200).default(""),
  addressLines: z.string().max(600).default(""),
  email: z.string().max(200).nullish(),
  phone: z.string().max(60).nullish(),
  website: z.string().max(200).nullish(),
  taxIdLabel: z.string().max(60).nullish(),
  taxIdValue: z.string().max(60).nullish(),
  // Drives the heading, not just the arithmetic: an unregistered issuer must
  // not put "Tax Invoice" on a document.
  taxRegistered: z.boolean().default(false),
  taxLabel: z.string().max(60).nullish(),
  taxRatePercent: z.number().int().min(0).max(100).default(0),
  taxNote: z.string().max(300).nullish(),
  defaultCurrency: z.string().min(3).max(3).default("AUD"),
  paymentTermsDays: z.number().int().min(0).max(365).default(14),
  paymentInstructions: z.string().max(1000).nullish(),
  bankDetails: z.string().max(1000).nullish(),
  footerNote: z.string().max(600).nullish(),
  logoUrl: z.string().max(400_000).nullish(),
  invoicePrefix: z.string().max(12).default("INV"),
  nextInvoiceNumber: z.number().int().min(1).default(1),
});

export const invoiceLineSchema = z.object({
  description: z.string().min(1).max(300),
  detail: z.string().max(1000).nullish(),
  quantityMilli: z.number().int().min(-1_000_000).max(1_000_000).default(1000),
  unitPriceMinor: z.number().int().min(-100_000_000).max(100_000_000).default(0),
});

export const saveInvoiceSchema = z.object({
  invoiceId: z.string().min(1).nullish(),
  documentType: invoiceDocumentTypeSchema.default("invoice"),
  clientName: z.string().min(1).max(200),
  clientAddressLines: z.string().max(600).nullish(),
  clientEmail: z.string().max(200).nullish(),
  clientTaxIdLabel: z.string().max(60).nullish(),
  clientTaxIdValue: z.string().max(60).nullish(),
  currency: z.string().min(3).max(3).default("AUD"),
  issueDate: isoDate,
  dueDate: isoDate,
  servicePeriod: z.string().max(200).nullish(),
  notes: z.string().max(2000).nullish(),
  lines: z.array(invoiceLineSchema).min(1).max(50),
});

export const invoiceIdSchema = z.object({ invoiceId: z.string().min(1) });

export const invoiceDocumentTokenSchema = z.object({
  token: z.string().min(1).max(4000),
});

export const setInvoiceStatusSchema = z.object({
  invoiceId: z.string().min(1),
  status: invoiceStatusSchema,
});

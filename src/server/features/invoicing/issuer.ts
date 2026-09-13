/**
 * Who a document is from, shared by invoices and quotes: the defaults that let
 * the first document go out before settings are filled in, and the snapshot
 * that keeps a sent document unchanged when settings are edited later.
 */
import { z } from "zod";
import type { InvoiceSettingsRow } from "./repositories/InvoiceRepository";

/** Sensible defaults so the first invoice is not blocked on a settings page. */
export function settingsOrDefaults(row: InvoiceSettingsRow | null) {
  return {
    legalName: row?.legalName ?? "",
    addressLines: row?.addressLines ?? "",
    email: row?.email ?? null,
    phone: row?.phone ?? null,
    website: row?.website ?? null,
    taxIdLabel: row?.taxIdLabel ?? null,
    taxIdValue: row?.taxIdValue ?? null,
    taxRegistered: row?.taxRegistered ?? false,
    taxLabel: row?.taxLabel ?? null,
    taxRatePercent: row?.taxRatePercent ?? 0,
    taxNote: row?.taxNote ?? null,
    defaultCurrency: row?.defaultCurrency ?? "AUD",
    paymentTermsDays: row?.paymentTermsDays ?? 14,
    paymentInstructions: row?.paymentInstructions ?? null,
    bankDetails: row?.bankDetails ?? null,
    footerNote: row?.footerNote ?? null,
    logoUrl: row?.logoUrl ?? null,
    invoicePrefix: row?.invoicePrefix ?? "INV",
    nextInvoiceNumber: row?.nextInvoiceNumber ?? 1,
  };
}

type IssuerSnapshot = ReturnType<typeof settingsOrDefaults>;

const issuerSnapshotSchema = z.object({
  legalName: z.string(),
  addressLines: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  website: z.string().nullable(),
  taxIdLabel: z.string().nullable(),
  taxIdValue: z.string().nullable(),
  taxRegistered: z.boolean(),
  taxLabel: z.string().nullable(),
  taxRatePercent: z.number(),
  taxNote: z.string().nullable(),
  defaultCurrency: z.string(),
  paymentTermsDays: z.number(),
  paymentInstructions: z.string().nullable(),
  bankDetails: z.string().nullable(),
  footerNote: z.string().nullable(),
  logoUrl: z.string().nullable(),
  invoicePrefix: z.string(),
  nextInvoiceNumber: z.number(),
}) satisfies z.ZodType<IssuerSnapshot>;

/**
 * The issuer as it was when the invoice was written. A snapshot that no
 * longer parses (an older shape, a hand edit) falls back to current settings
 * rather than rendering a broken document.
 */
export function issuerFor(
  row: { issuerSnapshotJson: string | null },
  settingsRow: InvoiceSettingsRow | null,
): IssuerSnapshot {
  if (!row.issuerSnapshotJson) return settingsOrDefaults(settingsRow);
  try {
    const parsed: unknown = JSON.parse(row.issuerSnapshotJson);
    const result = issuerSnapshotSchema.safeParse(parsed);
    if (result.success) return result.data;
  } catch {
    // fall through to current settings
  }
  return settingsOrDefaults(settingsRow);
}

/** Quote numbering and wording, with the same "works before setup" defaults. */
export function quoteSettingsOrDefaults(row: InvoiceSettingsRow | null) {
  return {
    quotePrefix: row?.quotePrefix ?? "QUO",
    nextQuoteNumber: row?.nextQuoteNumber ?? 1,
    quoteValidityDays: row?.quoteValidityDays ?? 30,
    quoteTerms: row?.quoteTerms ?? null,
  };
}

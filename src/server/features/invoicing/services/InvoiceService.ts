import type { z } from "zod";
import { AppError } from "@/server/lib/errors";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import {
  InvoiceRepository as Repo,
  type InvoiceRow,
  type InvoiceSettingsRow,
} from "../repositories/InvoiceRepository";
import {
  computeTotals,
  documentHeading,
  formatInvoiceNumber,
  lineAmountMinor,
} from "../invoiceTotals";
import type {
  invoiceSettingsSchema,
  saveInvoiceSchema,
  setInvoiceStatusSchema,
} from "@/types/schemas/invoicing";

const MODULE = "invoicing" as const;

/** Sensible defaults so the first invoice is not blocked on a settings page. */
function settingsOrDefaults(row: InvoiceSettingsRow | null) {
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

export type IssuerSnapshot = ReturnType<typeof settingsOrDefaults>;

function publicInvoice(row: InvoiceRow) {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    documentType: row.documentType,
    clientName: row.clientName,
    clientAddressLines: row.clientAddressLines,
    clientEmail: row.clientEmail,
    clientTaxIdLabel: row.clientTaxIdLabel,
    clientTaxIdValue: row.clientTaxIdValue,
    currency: row.currency,
    issueDate: row.issueDate,
    dueDate: row.dueDate,
    servicePeriod: row.servicePeriod,
    notes: row.notes,
    taxLabel: row.taxLabel,
    taxRatePercent: row.taxRatePercent,
    subtotalMinor: row.subtotalMinor,
    taxMinor: row.taxMinor,
    totalMinor: row.totalMinor,
    sentAt: row.sentAt,
    paidAt: row.paidAt,
    createdAt: row.createdAt,
  };
}

export type PublicInvoice = ReturnType<typeof publicInvoice>;

async function workspace(organizationId: string, userId: string) {
  await BusinessModuleService.requireAccess(organizationId, userId, MODULE);
  const [settingsRow, invoiceRows] = await Promise.all([
    Repo.getSettings(organizationId),
    Repo.listInvoices(organizationId),
  ]);
  return {
    settings: settingsOrDefaults(settingsRow),
    invoices: invoiceRows.map(publicInvoice),
  };
}

async function saveSettings(
  organizationId: string,
  userId: string,
  input: z.infer<typeof invoiceSettingsSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    MODULE,
    "manage",
  );
  const row = await Repo.upsertSettings(organizationId, input);
  return settingsOrDefaults(row);
}

async function detail(
  organizationId: string,
  userId: string,
  invoiceId: string,
) {
  await BusinessModuleService.requireAccess(organizationId, userId, MODULE);
  const row = await Repo.getInvoice(organizationId, invoiceId);
  if (!row) throw new AppError("NOT_FOUND", "Invoice not found.");
  const [lines, settingsRow] = await Promise.all([
    Repo.listLines(organizationId, invoiceId),
    Repo.getSettings(organizationId),
  ]);
  // The issuer is read from the snapshot taken when the invoice was written,
  // so editing settings later never rewrites a document already sent.
  const issuer = row.issuerSnapshotJson
    ? (JSON.parse(row.issuerSnapshotJson) as IssuerSnapshot)
    : settingsOrDefaults(settingsRow);
  return {
    invoice: publicInvoice(row),
    heading: documentHeading({
      documentType: row.documentType,
      taxRegistered: issuer.taxRegistered,
    }),
    issuer,
    lines: lines.map((line) => ({
      id: line.id,
      description: line.description,
      detail: line.detail,
      quantityMilli: line.quantityMilli,
      unitPriceMinor: line.unitPriceMinor,
      amountMinor: line.amountMinor,
    })),
  };
}

/**
 * Create or update an invoice.
 *
 * A number is assigned once, on first save, and the issuer is snapshotted with
 * it: an invoice is a record of what was sent, not a live view of current
 * settings.
 */
async function save(
  organizationId: string,
  userId: string,
  input: z.infer<typeof saveInvoiceSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    MODULE,
    "manage",
  );
  const settingsRow = await Repo.getSettings(organizationId);
  const issuer = settingsOrDefaults(settingsRow);
  // An unregistered issuer charges no tax, whatever the settings say, because
  // the document it produces is not a tax invoice.
  const taxRatePercent = issuer.taxRegistered ? issuer.taxRatePercent : 0;
  const totals = computeTotals(input.lines, taxRatePercent);

  const existing = input.invoiceId
    ? await Repo.getInvoice(organizationId, input.invoiceId)
    : null;
  if (input.invoiceId && !existing) {
    throw new AppError("NOT_FOUND", "Invoice not found.");
  }
  if (existing && existing.status !== "draft") {
    throw new AppError(
      "VALIDATION_ERROR",
      "This invoice has been issued. Void it and raise a new one rather than editing what was sent.",
    );
  }

  const shared = {
    documentType: input.documentType,
    clientName: input.clientName,
    clientAddressLines: input.clientAddressLines ?? null,
    clientEmail: input.clientEmail ?? null,
    clientTaxIdLabel: input.clientTaxIdLabel ?? null,
    clientTaxIdValue: input.clientTaxIdValue ?? null,
    currency: input.currency,
    issueDate: input.issueDate,
    dueDate: input.dueDate,
    servicePeriod: input.servicePeriod ?? null,
    notes: input.notes ?? null,
    taxLabel: issuer.taxRegistered ? (issuer.taxLabel ?? "Tax") : null,
    taxRatePercent,
    subtotalMinor: totals.subtotalMinor,
    taxMinor: totals.taxMinor,
    totalMinor: totals.totalMinor,
    issuerSnapshotJson: JSON.stringify(issuer),
  };

  let invoice: InvoiceRow;
  if (existing) {
    invoice = (await Repo.updateInvoice(organizationId, existing.id, shared))!;
  } else {
    const sequence = issuer.nextInvoiceNumber;
    invoice = await Repo.insertInvoice({
      id: crypto.randomUUID(),
      organizationId,
      number: formatInvoiceNumber(issuer.invoicePrefix, sequence),
      status: "draft",
      ...shared,
    });
    await Repo.upsertSettings(organizationId, {
      nextInvoiceNumber: sequence + 1,
    });
  }

  await Repo.replaceLines(
    organizationId,
    invoice.id,
    input.lines.map((line, index) => ({
      id: crypto.randomUUID(),
      organizationId,
      invoiceId: invoice.id,
      position: index,
      description: line.description,
      detail: line.detail ?? null,
      quantityMilli: line.quantityMilli,
      unitPriceMinor: line.unitPriceMinor,
      amountMinor: lineAmountMinor(line),
    })),
  );
  return publicInvoice(invoice);
}

async function setStatus(
  organizationId: string,
  userId: string,
  input: z.infer<typeof setInvoiceStatusSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    MODULE,
    "manage",
  );
  const row = await Repo.getInvoice(organizationId, input.invoiceId);
  if (!row) throw new AppError("NOT_FOUND", "Invoice not found.");
  const stamps: Partial<typeof row> = {};
  if (input.status === "sent" && !row.sentAt) {
    stamps.sentAt = new Date().toISOString();
  }
  if (input.status === "paid") {
    stamps.paidAt = new Date().toISOString();
    if (!row.sentAt) stamps.sentAt = new Date().toISOString();
  }
  const updated = await Repo.updateInvoice(organizationId, input.invoiceId, {
    status: input.status,
    ...stamps,
  });
  return publicInvoice(updated ?? row);
}

async function remove(
  organizationId: string,
  userId: string,
  invoiceId: string,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    MODULE,
    "manage",
  );
  const row = await Repo.getInvoice(organizationId, invoiceId);
  if (!row) throw new AppError("NOT_FOUND", "Invoice not found.");
  if (row.status !== "draft") {
    throw new AppError(
      "VALIDATION_ERROR",
      "Only a draft can be deleted. Void an issued invoice so the number stays accounted for.",
    );
  }
  await Repo.deleteInvoice(organizationId, invoiceId);
  return { deleted: true };
}

export const InvoiceService = {
  workspace,
  saveSettings,
  detail,
  save,
  setStatus,
  remove,
};

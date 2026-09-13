import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { BusinessAuditRepository } from "@/server/features/business-modules/repositories/BusinessAuditRepository";
import { CommerceRepository } from "@/server/features/commerce/repositories/CommerceRepository";
import { LeadDetailRepository } from "@/server/features/crm/repositories/LeadDetailRepository";
import { InvoiceRepository } from "@/server/features/invoicing/repositories/InvoiceRepository";
import {
  issuerFor,
  quoteSettingsOrDefaults,
  settingsOrDefaults,
} from "@/server/features/invoicing/issuer";
import {
  computeTotals,
  formatInvoiceNumber,
  lineAmountMinor,
} from "@/server/features/invoicing/invoiceTotals";
import { AppError } from "@/server/lib/errors";
import type { SaveQuoteInput } from "@/types/schemas/quotes";
import { publicLines, publicQuote } from "../quotePresenters";
import {
  QuoteRepository as Repo,
  type QuoteRow,
} from "../repositories/QuoteRepository";

/** Quotes live in the invoicing module: same issuer, tax and numbering home. */
export const QUOTE_MODULE = "invoicing" as const;

async function workspace(organizationId: string, userId: string) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    QUOTE_MODULE,
  );
  const [rows, settingsRow] = await Promise.all([
    Repo.listQuotes(organizationId),
    InvoiceRepository.getSettings(organizationId),
  ]);
  return {
    quotes: rows.map((row) => publicQuote(row)),
    settings: {
      ...quoteSettingsOrDefaults(settingsRow),
      defaultCurrency: settingsOrDefaults(settingsRow).defaultCurrency,
    },
  };
}

async function readDetail(organizationId: string, row: QuoteRow) {
  const [lines, settingsRow] = await Promise.all([
    Repo.listLines(organizationId, row.id),
    InvoiceRepository.getSettings(organizationId),
  ]);
  return {
    quote: publicQuote(row),
    heading: "Quotation",
    issuer: issuerFor(row, settingsRow),
    lines: publicLines(lines),
  };
}

async function detail(organizationId: string, userId: string, quoteId: string) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    QUOTE_MODULE,
  );
  const row = await Repo.getQuote(organizationId, quoteId);
  if (!row) throw new AppError("NOT_FOUND", "Quote not found.");
  return readDetail(organizationId, row);
}

/** Read for a signed link: the token, not a session, is the credential. */
async function detailForClaims(organizationId: string, quoteId: string) {
  const row = await Repo.getQuote(organizationId, quoteId);
  if (!row) throw new AppError("NOT_FOUND", "Quote not found.");
  return readDetail(organizationId, row);
}

async function leadLinks(organizationId: string, leadId: string | null) {
  if (!leadId) return { leadId: null, contactId: null, companyId: null };
  const lead = await LeadDetailRepository.getLead(organizationId, leadId);
  if (!lead) throw new AppError("NOT_FOUND", "Lead not found.");
  return {
    leadId,
    contactId: lead.contact?.id ?? null,
    companyId: lead.company?.id ?? null,
  };
}

/** A line may name a catalogue item, but only one from this workspace. */
async function checkProducts(
  organizationId: string,
  lines: SaveQuoteInput["lines"],
) {
  const ids = [...new Set(lines.map((line) => line.productId).filter(Boolean))];
  for (const id of ids) {
    if (!id) continue;
    if (!(await CommerceRepository.getProduct(organizationId, id))) {
      throw new AppError("NOT_FOUND", "A quoted product was not found.");
    }
  }
}

/**
 * Create or update a draft quote. The number is assigned once, on first save,
 * from the quote sequence; the issuer and tax are frozen with it, as on an
 * invoice, so a later settings change never rewrites what the client saw.
 */
async function save(
  organizationId: string,
  userId: string,
  input: SaveQuoteInput,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    QUOTE_MODULE,
    "manage",
  );
  const existing = input.quoteId
    ? await Repo.getQuote(organizationId, input.quoteId)
    : null;
  if (input.quoteId && !existing) {
    throw new AppError("NOT_FOUND", "Quote not found.");
  }
  if (existing && existing.status !== "draft") {
    throw new AppError(
      "VALIDATION_ERROR",
      "This quote has been sent. Move it back to draft before editing it.",
    );
  }
  await checkProducts(organizationId, input.lines);
  const links = await leadLinks(
    organizationId,
    input.leadId ?? existing?.leadId ?? null,
  );

  const settingsRow = await InvoiceRepository.getSettings(organizationId);
  const issuer = settingsOrDefaults(settingsRow);
  const quoteSettings = quoteSettingsOrDefaults(settingsRow);
  const taxRatePercent = issuer.taxRegistered ? issuer.taxRatePercent : 0;
  const totals = computeTotals(input.lines, taxRatePercent);

  const shared = {
    ...links,
    title: input.title ?? null,
    clientName: input.clientName,
    clientAddressLines: input.clientAddressLines ?? null,
    clientEmail: input.clientEmail ?? null,
    clientTaxIdLabel: input.clientTaxIdLabel ?? null,
    clientTaxIdValue: input.clientTaxIdValue ?? null,
    currency: input.currency,
    issueDate: input.issueDate,
    validUntil: input.validUntil,
    notes: input.notes ?? null,
    terms: input.terms ?? existing?.terms ?? quoteSettings.quoteTerms,
    taxLabel: issuer.taxRegistered ? (issuer.taxLabel ?? "Tax") : null,
    taxRatePercent,
    subtotalMinor: totals.subtotalMinor,
    taxMinor: totals.taxMinor,
    totalMinor: totals.totalMinor,
    issuerSnapshotJson: JSON.stringify(issuer),
  };

  let quote: QuoteRow | null;
  if (existing) {
    quote = await Repo.updateQuote(organizationId, existing.id, shared);
  } else {
    const sequence = quoteSettings.nextQuoteNumber;
    quote = await Repo.insertQuote({
      id: crypto.randomUUID(),
      organizationId,
      number: formatInvoiceNumber(quoteSettings.quotePrefix, sequence),
      status: "draft",
      ...shared,
    });
    await InvoiceRepository.upsertSettings(organizationId, {
      nextQuoteNumber: sequence + 1,
    });
  }
  if (!quote) throw new AppError("NOT_FOUND", "Quote not found.");

  await Repo.replaceLines(
    organizationId,
    quote.id,
    input.lines.map((line, index) => ({
      id: crypto.randomUUID(),
      organizationId,
      quoteId: quote.id,
      position: index,
      productId: line.productId ?? null,
      description: line.description,
      detail: line.detail ?? null,
      quantityMilli: line.quantityMilli,
      unitPriceMinor: line.unitPriceMinor,
      amountMinor: lineAmountMinor(line),
    })),
  );
  if (!existing) {
    await BusinessAuditRepository.record({
      organizationId,
      actorUserId: userId,
      action: "quote.created",
      targetType: "quote",
      targetId: quote.id,
      metadata: { number: quote.number, leadId: quote.leadId },
    });
  }
  return publicQuote(quote);
}

async function remove(organizationId: string, userId: string, quoteId: string) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    QUOTE_MODULE,
    "manage",
  );
  const row = await Repo.getQuote(organizationId, quoteId);
  if (!row) throw new AppError("NOT_FOUND", "Quote not found.");
  if (row.status !== "draft") {
    throw new AppError(
      "VALIDATION_ERROR",
      "Only a draft can be deleted; a sent quote stays on record.",
    );
  }
  await Repo.deleteQuote(organizationId, quoteId);
  return { deleted: true };
}

export const QuoteService = {
  workspace,
  detail,
  detailForClaims,
  save,
  remove,
};

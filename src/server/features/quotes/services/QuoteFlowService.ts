import { BusinessAuditRepository } from "@/server/features/business-modules/repositories/BusinessAuditRepository";
import { BusinessModuleRepository } from "@/server/features/business-modules/repositories/BusinessModuleRepository";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { CommerceRepository } from "@/server/features/commerce/repositories/CommerceRepository";
import { CrmRepository } from "@/server/features/crm/repositories/CrmRepository";
import { LeadDetailRepository } from "@/server/features/crm/repositories/LeadDetailRepository";
import {
  addDays,
  formatMoney,
} from "@/server/features/invoicing/invoiceTotals";
import {
  quoteSettingsOrDefaults,
  settingsOrDefaults,
} from "@/server/features/invoicing/issuer";
import { InvoiceRepository } from "@/server/features/invoicing/repositories/InvoiceRepository";
import { InvoiceService } from "@/server/features/invoicing/services/InvoiceService";
import { AppError } from "@/server/lib/errors";
import { getRequiredEnvValue } from "@/server/lib/runtime-env";
import type { QuoteStatus } from "@/types/schemas/quotes";
import {
  QUOTE_LINK_TTL_MS,
  quotePath,
  quotePdfPath,
  signQuoteToken,
} from "../quoteLink";
import { publicQuote } from "../quotePresenters";
import { canMoveQuote, todayIso } from "../quoteRules";
import {
  QuoteRepository as Repo,
  type QuoteRow,
} from "../repositories/QuoteRepository";
import { QUOTE_MODULE } from "./QuoteService";

const FOLLOW_UP_DAYS = 3;

const STATUS_WORD: Record<QuoteStatus, string> = {
  draft: "moved back to draft",
  sent: "sent",
  accepted: "accepted",
  declined: "declined",
  expired: "expired",
};

/**
 * Put the quote's progress in the lead's journal, and when it goes out, make
 * sure somebody is due to chase it.
 */
async function journalOnLead(
  organizationId: string,
  userId: string,
  quote: QuoteRow,
  status: QuoteStatus,
) {
  if (!quote.leadId) return;
  const membership = await BusinessModuleRepository.findMembership(
    organizationId,
    userId,
  );
  if (!membership) return;
  const amount = formatMoney(quote.totalMinor, quote.currency);
  await CrmRepository.createActivity(organizationId, membership.id, {
    leadId: quote.leadId,
    contactId: quote.contactId ?? undefined,
    activityType: "quotation",
    subject: `Quotation ${quote.number} ${STATUS_WORD[status]} (${amount})`,
    notes: quote.title ?? undefined,
    outcome:
      status === "accepted"
        ? "interested"
        : status === "declined"
          ? "not_interested"
          : undefined,
  });
  if (status !== "sent") return;
  const lead = await LeadDetailRepository.getLead(organizationId, quote.leadId);
  if (lead && !lead.lead.nextActionDue) {
    await CrmRepository.updateLead(organizationId, {
      id: quote.leadId,
      nextAction: `Follow up quotation ${quote.number}`,
      nextActionDue: new Date(
        Date.now() + FOLLOW_UP_DAYS * 86_400_000,
      ).toISOString(),
    });
  }
}

async function setStatus(
  organizationId: string,
  userId: string,
  input: { quoteId: string; status: QuoteStatus },
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    QUOTE_MODULE,
    "manage",
  );
  const row = await Repo.getQuote(organizationId, input.quoteId);
  if (!row) throw new AppError("NOT_FOUND", "Quote not found.");
  const current = publicQuote(row).status;
  if (!canMoveQuote(current, input.status)) {
    throw new AppError(
      "VALIDATION_ERROR",
      `A ${current} quote cannot be marked ${input.status}.`,
    );
  }
  if (input.status === "sent" && row.validUntil < todayIso()) {
    throw new AppError(
      "VALIDATION_ERROR",
      "This quote's valid-until date has passed. Edit the date before sending it.",
    );
  }
  const stamp = new Date().toISOString();
  const updated = await Repo.updateQuote(organizationId, row.id, {
    status: input.status,
    ...(input.status === "sent" ? { sentAt: stamp } : {}),
    ...(input.status === "accepted" || input.status === "declined"
      ? { respondedAt: stamp }
      : {}),
  });
  if (!updated) throw new AppError("NOT_FOUND", "Quote not found.");
  await journalOnLead(organizationId, userId, updated, input.status);
  await BusinessAuditRepository.record({
    organizationId,
    actorUserId: userId,
    action: `quote.${input.status}`,
    targetType: "quote",
    targetId: row.id,
    metadata: { number: row.number, from: current },
  });
  return publicQuote(updated);
}

/** A link the client opens without an account. Asked for, never handed out. */
async function documentLink(
  organizationId: string,
  userId: string,
  quoteId: string,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    QUOTE_MODULE,
  );
  const row = await Repo.getQuote(organizationId, quoteId);
  if (!row) throw new AppError("NOT_FOUND", "Quote not found.");
  const expiresAt = Date.now() + QUOTE_LINK_TTL_MS;
  const token = await signQuoteToken(
    { quoteId: row.id, organizationId, expiresAt },
    await getRequiredEnvValue("BETTER_AUTH_SECRET"),
  );
  return {
    number: row.number,
    path: quotePath(row.id, token),
    pdfPath: quotePdfPath(row.id, token),
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

/** What a new quote for this lead should start with. Nothing is saved. */
async function prefillFromLead(
  organizationId: string,
  userId: string,
  leadId: string,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    QUOTE_MODULE,
  );
  const row = await LeadDetailRepository.getLead(organizationId, leadId);
  if (!row) throw new AppError("NOT_FOUND", "Lead not found.");
  const settingsRow = await InvoiceRepository.getSettings(organizationId);
  const quoteSettings = quoteSettingsOrDefaults(settingsRow);
  const contactName = row.contact
    ? [row.contact.firstName, row.contact.lastName].filter(Boolean).join(" ")
    : "";
  const issueDate = todayIso();
  return {
    leadId,
    title: row.lead.title,
    clientName: row.company?.name ?? contactName,
    attention: row.company && contactName ? contactName : null,
    clientEmail: row.contact?.email ?? null,
    currency: settingsOrDefaults(settingsRow).defaultCurrency,
    issueDate,
    validUntil: addDays(issueDate, quoteSettings.quoteValidityDays),
    terms: quoteSettings.quoteTerms,
  };
}

/** The catalogue a quote is built from: active products and services. */
async function searchCatalogue(
  organizationId: string,
  userId: string,
  input: { search?: string; itemType?: "product" | "service" },
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    QUOTE_MODULE,
  );
  const { products } = await CommerceRepository.listProducts(organizationId, {
    search: input.search,
    status: "active",
    itemType: input.itemType,
    limit: 30,
    offset: 0,
  });
  return products.map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.sku,
    itemType: product.itemType,
    category: product.category,
    description: product.description,
    salePriceMinor: product.salePriceMinor,
  }));
}

/** Specific catalogue items by id, active or not, from this workspace only. */
async function catalogueItems(
  organizationId: string,
  userId: string,
  ids: readonly string[],
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    QUOTE_MODULE,
  );
  const rows = await Promise.all(
    [...new Set(ids)].map((id) =>
      CommerceRepository.getProduct(organizationId, id),
    ),
  );
  return rows.flatMap((product) =>
    product
      ? [
          {
            id: product.id,
            name: product.name,
            description: product.description,
            salePriceMinor: product.salePriceMinor,
          },
        ]
      : [],
  );
}

/** Turn an accepted quote into a draft invoice with the same lines. */
async function convertToInvoice(
  organizationId: string,
  userId: string,
  quoteId: string,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    QUOTE_MODULE,
    "manage",
  );
  const row = await Repo.getQuote(organizationId, quoteId);
  if (!row) throw new AppError("NOT_FOUND", "Quote not found.");
  if (row.status !== "accepted") {
    throw new AppError(
      "VALIDATION_ERROR",
      "Only an accepted quote can become an invoice.",
    );
  }
  if (row.convertedInvoiceId) {
    throw new AppError(
      "VALIDATION_ERROR",
      "This quote already has an invoice.",
    );
  }
  const [lines, settingsRow] = await Promise.all([
    Repo.listLines(organizationId, quoteId),
    InvoiceRepository.getSettings(organizationId),
  ]);
  const issueDate = todayIso();
  const invoice = await InvoiceService.save(organizationId, userId, {
    documentType: "invoice",
    clientName: row.clientName,
    clientAddressLines: row.clientAddressLines,
    clientEmail: row.clientEmail,
    clientTaxIdLabel: row.clientTaxIdLabel,
    clientTaxIdValue: row.clientTaxIdValue,
    currency: row.currency,
    issueDate,
    dueDate: addDays(
      issueDate,
      settingsOrDefaults(settingsRow).paymentTermsDays,
    ),
    servicePeriod: row.title,
    notes: `As quoted in ${row.number}.`,
    lines: lines.map((line) => ({
      description: line.description,
      detail: line.detail,
      quantityMilli: line.quantityMilli,
      unitPriceMinor: line.unitPriceMinor,
    })),
  });
  await Repo.updateQuote(organizationId, quoteId, {
    convertedInvoiceId: invoice.id,
  });
  return { invoiceId: invoice.id, number: invoice.number };
}

async function listForLead(
  organizationId: string,
  userId: string,
  leadId: string,
) {
  try {
    await BusinessModuleService.requireAccess(
      organizationId,
      userId,
      QUOTE_MODULE,
    );
  } catch {
    // No invoicing access: the lead page simply shows no quotes.
    return { canQuote: false, quotes: [] };
  }
  const rows = await Repo.listForLead(organizationId, leadId);
  return { canQuote: true, quotes: rows.map((row) => publicQuote(row)) };
}

export const QuoteFlowService = {
  setStatus,
  documentLink,
  prefillFromLead,
  searchCatalogue,
  catalogueItems,
  convertToInvoice,
  listForLead,
};

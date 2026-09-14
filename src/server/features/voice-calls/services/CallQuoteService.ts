import { BusinessAuditRepository } from "@/server/features/business-modules/repositories/BusinessAuditRepository";
import { BusinessModuleRepository } from "@/server/features/business-modules/repositories/BusinessModuleRepository";
import { CommerceRepository } from "@/server/features/commerce/repositories/CommerceRepository";
import { CommunicationsRepository } from "@/server/features/communications/repositories/CommunicationsRepository";
import { resolveAiKey } from "@/server/features/communications/services/WhatsappAssistantService";
import { ReminderRepository } from "@/server/features/crm/repositories/ReminderRepository";
import { addDays } from "@/server/features/invoicing/invoiceTotals";
import {
  quoteSettingsOrDefaults,
  settingsOrDefaults,
} from "@/server/features/invoicing/issuer";
import { InvoiceRepository } from "@/server/features/invoicing/repositories/InvoiceRepository";
import { todayIso } from "@/server/features/quotes/quoteRules";
import { QuoteEmailService } from "@/server/features/quotes/services/QuoteEmailService";
import { QuoteService } from "@/server/features/quotes/services/QuoteService";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { matchQuote, type QuoteMatch } from "../callQuote";
import type { PhoneCallReport } from "../elevenlabsWebhook";
import { PhoneCallRepository as Repo } from "../repositories/PhoneCallRepository";

type QuoteInput = {
  organizationId: string;
  leadId: string;
  contactId: string;
  clientName: string;
  email: string | null;
  report: PhoneCallReport;
};

function describe(error: unknown) {
  return error instanceof Error ? error.message : "unknown error";
}

async function aiKey(organizationId: string) {
  const connection = await CommunicationsRepository.getIntegrationByProvider(
    organizationId,
    "claude_haiku",
  );
  return (
    (connection?.status === "connected"
      ? await resolveAiKey(connection)
      : null) ??
    (await getOptionalEnvValue("ANTHROPIC_API_KEY")) ??
    null
  );
}

async function match(input: QuoteInput) {
  const { products } = await CommerceRepository.listProducts(
    input.organizationId,
    { status: "active", limit: 200, offset: 0 },
  );
  const catalogue = products.map((product) => ({
    id: product.id,
    name: product.name,
    description: product.description,
    salePriceMinor: product.salePriceMinor,
  }));
  if (!catalogue.length) return null;
  const key = await aiKey(input.organizationId);
  if (!key) return null;
  try {
    return await matchQuote(input.report, catalogue, key);
  } catch (error) {
    // The tenant key can be revoked while the platform key still works.
    const platform = await getOptionalEnvValue("ANTHROPIC_API_KEY");
    if (!platform || platform === key) throw error;
    return matchQuote(input.report, catalogue, platform);
  }
}

async function saveDraft(input: QuoteInput, userId: string, found: QuoteMatch) {
  const settings = await InvoiceRepository.getSettings(input.organizationId);
  const issueDate = todayIso();
  return QuoteService.save(input.organizationId, userId, {
    leadId: input.leadId,
    title: input.report.captured.service_interest?.slice(0, 200) ?? null,
    clientName: input.clientName,
    clientEmail: input.email,
    currency: settingsOrDefaults(settings).defaultCurrency,
    issueDate,
    validUntil: addDays(
      issueDate,
      quoteSettingsOrDefaults(settings).quoteValidityDays,
    ),
    notes: "Prepared from your phone call with our team.",
    lines: found.lines.map(({ item, quantity }) => ({
      productId: item.id,
      description: item.name,
      detail: item.description,
      quantityMilli: quantity * 1000,
      unitPriceMinor: item.salePriceMinor,
    })),
  });
}

/** Leave the quote for a person: a note on the lead and a reminder now. */
async function handToOwner(
  input: QuoteInput,
  memberId: string,
  title: string,
  note: string,
) {
  const at = new Date().toISOString();
  await Repo.insertCallActivity({
    organizationId: input.organizationId,
    leadId: input.leadId,
    contactId: input.contactId,
    activityType: "quotation",
    subject: title,
    notes: note,
    outcome: "need_quotation",
    occurredAt: at,
  });
  await ReminderRepository.create({
    organizationId: input.organizationId,
    memberId,
    leadId: input.leadId,
    title,
    note,
    remindAt: at,
  });
}

/**
 * When a caller asked for a quote: build it from the catalogue and email it
 * straight away if every item matched without doubt and there is an address
 * to send to. Anything less stays a draft with a reminder for the owner.
 * Returns what happened; it never throws, because the call is already saved.
 */
async function quoteFromCall(input: QuoteInput): Promise<string> {
  if (!input.report.captured.quote_request?.trim()) {
    return "skipped: no quote requested";
  }
  // Quotes are written as the owner: a webhook has no signed-in member.
  const owner = await BusinessModuleRepository.findOwner(input.organizationId);
  if (!owner) return "skipped: no owner to act for";
  try {
    const found = await match(input);
    if (!found?.lines.length) {
      await handToOwner(
        input,
        owner.id,
        `Quote requested: ${input.report.captured.quote_request}`.slice(0, 200),
        "Nothing in Products matched what the caller asked for. Build the quote by hand.",
      );
      return "needs a person: no catalogue match";
    }
    const quote = await saveDraft(input, owner.userId, found);
    if (!found.confident || !input.email) {
      const why = !input.email
        ? "No email address was captured."
        : found.reason || "The package wasn't certain.";
      await handToOwner(
        input,
        owner.id,
        `Draft quote ${quote.number} ready — review and send`,
        why,
      );
      return `drafted ${quote.number}: ${why}`.slice(0, 300);
    }
    try {
      await QuoteEmailService.emailQuote(input.organizationId, owner.userId, {
        quoteId: quote.id,
      });
    } catch (error) {
      await handToOwner(
        input,
        owner.id,
        `Draft quote ${quote.number} could not be emailed`,
        describe(error),
      );
      return `drafted ${quote.number}: email failed: ${describe(error)}`.slice(
        0,
        300,
      );
    }
    await BusinessAuditRepository.record({
      organizationId: input.organizationId,
      actorUserId: "system:elevenlabs",
      action: "quote.auto_sent_from_call",
      targetType: "quote",
      targetId: quote.id,
      metadata: { number: quote.number, reason: found.reason },
    });
    return `sent ${quote.number}`;
  } catch (error) {
    return `failed: ${describe(error)}`.slice(0, 300);
  }
}

export const CallQuoteService = { quoteFromCall };

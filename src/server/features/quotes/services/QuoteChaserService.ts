import { BusinessAuditRepository } from "@/server/features/business-modules/repositories/BusinessAuditRepository";
import { BusinessModuleRepository } from "@/server/features/business-modules/repositories/BusinessModuleRepository";
import { WhatsappAssistantRepository } from "@/server/features/communications/repositories/WhatsappAssistantRepository";
import { organizationModelKey } from "@/server/features/communications/services/WhatsappAssistantService";
import { ReminderRepository } from "@/server/features/crm/repositories/ReminderRepository";
import { outboundFor } from "@/server/features/email/providers/outbound";
import { EmailCustomerRepository } from "@/server/features/email/repositories/EmailCustomerRepository";
import { EmailRepository } from "@/server/features/email/repositories/EmailRepository";
import { recordOutbound } from "@/server/features/email/services/EmailService";
import { formatMoney } from "@/server/features/invoicing/invoiceTotals";
import { settingsOrDefaults } from "@/server/features/invoicing/issuer";
import { InvoiceRepository } from "@/server/features/invoicing/repositories/InvoiceRepository";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { inWorkingHours } from "@/server/lib/working-hours";
import { nextChaseStep, writeChaser, type ChaseStep } from "../quoteChaser";
import { QuoteChaserRepository as Chaser } from "../repositories/QuoteChaserRepository";
import {
  QuoteRepository,
  type QuoteRow,
} from "../repositories/QuoteRepository";
import { QuoteFlowService } from "./QuoteFlowService";

const AUTHOR = "assistant:quote-follow-up";
/** Past two follow-ups a quote is never looked at again. */
const DONE = 3;

async function note(
  quote: QuoteRow,
  subject: string,
  notes: string,
  activityType: "email" | "quotation",
) {
  if (!quote.leadId || !quote.contactId) return;
  await EmailCustomerRepository.journal({
    organizationId: quote.organizationId,
    leadId: quote.leadId,
    contactId: quote.contactId,
    subject,
    notes,
    outcome: activityType === "email" ? "sent" : "no_response",
    activityType,
  });
}

/** After two unanswered follow-ups, a person should pick up the phone. */
async function handOver(quote: QuoteRow) {
  await QuoteRepository.updateQuote(quote.organizationId, quote.id, {
    chaseCount: DONE,
  });
  const title = `No reply to ${quote.number} — give ${quote.clientName} a call`;
  await note(
    quote,
    title,
    "Two follow-up emails went unanswered. Follow-ups by email have stopped.",
    "quotation",
  );
  const owner = await BusinessModuleRepository.findOwner(quote.organizationId);
  if (!owner) return;
  await ReminderRepository.create({
    organizationId: quote.organizationId,
    memberId: owner.id,
    leadId: quote.leadId,
    title,
    note: `Quotation ${quote.number} (${formatMoney(quote.totalMinor, quote.currency)}) has had two follow-ups and no answer.`,
    remindAt: new Date().toISOString(),
  });
}

async function sendFollowUp(
  quote: QuoteRow,
  step: Exclude<ChaseStep, "handoff">,
  email: string,
): Promise<string> {
  const organizationId = quote.organizationId;
  const account = await EmailRepository.getAccount(organizationId);
  if (account?.status !== "connected") return "skipped: no connected mailbox";
  const threadId =
    quote.emailThreadId ??
    (await Chaser.findQuoteThread(organizationId, quote.number, email));
  const thread = threadId
    ? await EmailRepository.getThread(organizationId, threadId)
    : null;
  if (!thread) {
    // Marked sent by hand, never emailed from here: nothing to follow up in.
    await QuoteRepository.updateQuote(organizationId, quote.id, {
      chaseCount: DONE,
    });
    return "skipped: the quote was not emailed from the app";
  }
  const history = await EmailRepository.listMessages(organizationId, thread.id);
  const last = history
    .filter((message) => message.direction !== "draft")
    .at(-1);
  const owner = await BusinessModuleRepository.findOwner(organizationId);
  if (!last || !owner) return "skipped: nothing to reply to";

  const [lines, link, settings, key] = await Promise.all([
    QuoteRepository.listLines(organizationId, quote.id),
    QuoteFlowService.documentLink(organizationId, owner.userId, quote.id),
    InvoiceRepository.getSettings(organizationId),
    organizationModelKey(organizationId),
  ]);
  const appUrl = ((await getOptionalEnvValue("BETTER_AUTH_URL")) ?? "").replace(
    /\/+$/,
    "",
  );
  const { text, written } = await writeChaser(
    {
      step,
      firstName: quote.clientName.split(" ")[0] ?? null,
      businessName: settingsOrDefaults(settings).legalName || account.address,
      number: quote.number,
      items: lines.map((line) => line.description),
      total: `${formatMoney(quote.totalMinor, quote.currency)} ${quote.currency}`,
      validUntil: quote.validUntil,
      viewUrl: `${appUrl}${link.path}`,
    },
    key,
  );
  const sent = await (await outboundFor(account)).reply({ thread, last, text });
  await recordOutbound(account, thread, sent, {
    to: [email],
    subject: last.subject,
    text,
    authoredBy: AUTHOR,
  });
  const at = new Date().toISOString();
  await QuoteRepository.updateQuote(organizationId, quote.id, {
    chaseCount: step === "first" ? 1 : 2,
    lastChasedAt: at,
  });
  await note(
    quote,
    `Follow-up email ${step === "first" ? 1 : 2} sent for ${quote.number}`,
    text,
    "email",
  );
  await BusinessAuditRepository.record({
    organizationId,
    actorUserId: "system:quote-follow-up",
    action: "quote.followed_up",
    targetType: "quote",
    targetId: quote.id,
    metadata: { number: quote.number, step, written },
  });
  return `sent ${step} (${written})`;
}

/**
 * The hourly round: every sent quote that is due a follow-up gets one, in the
 * business's working hours, unless the conversation has already moved on.
 * One quote failing never stops the rest.
 */
async function runDueFollowUps(now = new Date()) {
  const results: Record<string, string> = {};
  const zones = new Map<string, string>();
  for (const quote of await Chaser.listCandidates()) {
    try {
      const step = nextChaseStep(quote, now);
      if (!step) continue;
      if (!zones.has(quote.organizationId)) {
        const settings = await WhatsappAssistantRepository.getSettings(
          quote.organizationId,
        );
        zones.set(
          quote.organizationId,
          settings?.timezone || "Australia/Brisbane",
        );
      }
      if (!inWorkingHours(now, zones.get(quote.organizationId) ?? "")) continue;
      const email = quote.clientEmail?.trim();
      if (!email || !quote.sentAt) continue;
      const moved = await Chaser.conversationMoved({
        organizationId: quote.organizationId,
        sentAt: quote.sentAt,
        email,
        contactId: quote.contactId,
        leadId: quote.leadId,
      });
      if (moved) {
        await QuoteRepository.updateQuote(quote.organizationId, quote.id, {
          chaseCount: DONE,
        });
        results[quote.number] = `stopped: ${moved}`;
        continue;
      }
      if (step === "handoff") {
        await handOver(quote);
        results[quote.number] = "handed to the owner";
        continue;
      }
      results[quote.number] = await sendFollowUp(quote, step, email);
    } catch (error) {
      results[quote.number] =
        `failed: ${error instanceof Error ? error.message : "unknown error"}`;
    }
  }
  return results;
}

export const QuoteChaserService = { runDueFollowUps };

import { BusinessModuleRepository } from "@/server/features/business-modules/repositories/BusinessModuleRepository";
import { toPlainText } from "@/server/features/communications/providers/assistant-knowledge";
import { generateWhatsappAiReply } from "@/server/features/communications/providers/whatsapp-ai";
import { CommunicationsRepository } from "@/server/features/communications/repositories/CommunicationsRepository";
import { WhatsappAssistantRepository } from "@/server/features/communications/repositories/WhatsappAssistantRepository";
import {
  businessContext,
  lookupProducts,
} from "@/server/features/communications/services/WhatsappAssistantReplyService";
import {
  WhatsappAssistantService,
  resolveAiKey,
} from "@/server/features/communications/services/WhatsappAssistantService";
import { ReminderRepository } from "@/server/features/crm/repositories/ReminderRepository";
import { formatMoney } from "@/server/features/invoicing/invoiceTotals";
import { QuoteRepository } from "@/server/features/quotes/repositories/QuoteRepository";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import type { InboundAttachment } from "@/shared/mail-bridge";
import { readAttachments } from "../attachmentReader";
import {
  CUSTOMER_RULES,
  assistantKeepsReplying,
  customerBrief,
  looksAutomated,
} from "../customerFollowUp";
import { outboundFor } from "../providers/outbound";
import { bareAddress } from "../providers/threading";
import { EmailCustomerRepository as Customers } from "../repositories/EmailCustomerRepository";
import {
  EmailRepository as Repo,
  type EmailAccountRow,
  type EmailMessageRow,
  type EmailThreadRow,
} from "../repositories/EmailRepository";
import { recordOutbound } from "./EmailService";

const ASSISTANT = "assistant";

type Customer = {
  contactId: string;
  leadId: string;
  name: string;
  brief: string;
};

async function modelKey(organizationId: string) {
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

/** Read what the sender attached and keep the notes on the message. */
async function readInbound(
  account: EmailAccountRow,
  inbound: EmailMessageRow,
  attachments: readonly InboundAttachment[],
) {
  const files = attachments.flatMap((file) =>
    file.contentBase64
      ? [
          {
            filename: file.filename,
            contentType: file.contentType,
            contentBase64: file.contentBase64,
          },
        ]
      : [],
  );
  if (!files.length) return null;
  const key = await modelKey(account.organizationId);
  if (!key) return null;
  try {
    const notes = await readAttachments(
      { subject: inbound.subject, text: inbound.textBody, files },
      key,
    );
    if (notes) {
      await Repo.updateMessage(account.organizationId, inbound.id, {
        attachmentNotes: notes,
      });
    }
    return notes;
  } catch (error) {
    console.error("Email attachments could not be read", error);
    return null;
  }
}

/** The sender as a customer: a CRM contact with an enquiry still open. */
async function customerFor(
  organizationId: string,
  inbound: EmailMessageRow,
  attachmentNotes: string | null,
): Promise<Customer | null> {
  const contact = await Customers.findContactByAddress(
    organizationId,
    bareAddress(inbound.fromAddress),
  );
  if (!contact) return null;
  const lead = await Customers.findOpenLead(organizationId, contact.id);
  if (!lead) return null;
  const [latest] = await QuoteRepository.listForLead(organizationId, lead.id);
  const lines = latest
    ? await QuoteRepository.listLines(organizationId, latest.id)
    : [];
  const name =
    [contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
    "The customer";
  return {
    contactId: contact.id,
    leadId: lead.id,
    name,
    brief: customerBrief({
      name,
      leadTitle: lead.title,
      quote: latest
        ? {
            number: latest.number,
            status: latest.status,
            total: `${formatMoney(latest.totalMinor, latest.currency)} ${latest.currency}`,
            validUntil: latest.validUntil,
            sentAt: latest.sentAt,
            lines: lines.map((line) => ({
              description: line.description,
              quantity: line.quantityMilli / 1000,
              amount: formatMoney(line.amountMinor, latest.currency),
            })),
          }
        : null,
      attachmentNotes,
    }),
  };
}

/** A reply that needs a person: a note on the lead and a reminder now. */
async function handToTeam(
  organizationId: string,
  customer: Customer,
  inbound: EmailMessageRow,
  reason: string,
) {
  const title = `Email from ${customer.name} needs you`;
  await Customers.journal({
    organizationId,
    leadId: customer.leadId,
    contactId: customer.contactId,
    subject: `${title}: ${inbound.subject ?? "(no subject)"}`,
    notes: `${reason}\n\nA draft reply is waiting in the Email module.`,
    outcome: "need_followup",
  });
  const owner = await BusinessModuleRepository.findOwner(organizationId);
  if (!owner) return;
  await ReminderRepository.create({
    organizationId,
    memberId: owner.id,
    leadId: customer.leadId,
    title,
    note: reason.slice(0, 500),
    remindAt: new Date().toISOString(),
  });
}

/**
 * Let the shared assistant answer an inbound email. It reads the same
 * settings, facts, prices and product lookup as WhatsApp. A customer with an
 * open enquiry is answered on their own quotation and sent straight away,
 * unless the reply needs a person; anyone else gets a draft unless the
 * account is on autopilot.
 */
async function replyWithAssistant(
  account: EmailAccountRow,
  threadRow: EmailThreadRow,
  inbound: EmailMessageRow,
  customer: Customer | null,
) {
  const organizationId = account.organizationId;
  const aiConnection = await CommunicationsRepository.getIntegrationByProvider(
    organizationId,
    "claude_haiku",
  );
  if (aiConnection?.status !== "connected") return;
  const automated = looksAutomated(
    inbound.subject,
    bareAddress(inbound.fromAddress),
  );
  if (customer && automated) return;
  const settings = WhatsappAssistantService.withDefaults(
    await WhatsappAssistantRepository.getSettings(organizationId),
  );
  const [history, context, apiKey] = await Promise.all([
    Repo.listMessages(organizationId, threadRow.id),
    businessContext(organizationId, settings),
    resolveAiKey(aiConnection),
  ]);
  const sentHistory = history.filter(
    (message) => message.direction !== "draft",
  );
  const result = await generateWhatsappAiReply({
    history: sentHistory.map((message) => ({
      direction: message.direction === "inbound" ? "inbound" : "outbound",
      body: message.attachmentNotes
        ? `${message.textBody ?? ""}\n\n[Attached photos or documents show:\n${message.attachmentNotes}]`
        : message.textBody,
    })),
    apiKey,
    model: settings.model ?? (await getOptionalEnvValue("WHATSAPP_AI_MODEL")),
    businessContext: [
      context,
      "## Channel\nThis is an email, not a chat. Write a complete reply: a greeting, the answer, and a short sign-off with the business name. Plain text only, no markdown.",
      customer ? `${customer.brief}\n\n${CUSTOMER_RULES}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    persona: settings.persona,
    lookupProducts: (query) => lookupProducts(organizationId, query),
  });
  if (!result?.reply) {
    if (customer) {
      await handToTeam(
        organizationId,
        customer,
        inbound,
        "The assistant could not write a reply.",
      );
    }
    return;
  }
  // An email is plain text; markdown emphasis would reach the reader as
  // asterisks around the words it was meant to lift.
  const body = toPlainText(result.reply);
  const flag = result.actions.find((action) => action.name === "flag_for_team");
  const flagReason =
    flag && typeof flag.input.reason === "string" ? flag.input.reason : null;
  const holdReason = customer
    ? flag
      ? (flagReason ?? "The customer needs a person.")
      : assistantKeepsReplying(sentHistory)
        ? "The assistant has already replied twice today without a person stepping in."
        : null
    : null;
  const sendNow = customer ? !holdReason : account.autopilot && !automated;

  if (sendNow) {
    const sent = await (
      await outboundFor(account)
    ).reply({ thread: threadRow, last: inbound, text: body });
    await recordOutbound(account, threadRow, sent, {
      to: [inbound.fromAddress],
      subject: inbound.subject,
      text: body,
      authoredBy: ASSISTANT,
    });
    if (customer) {
      await Customers.journal({
        organizationId,
        leadId: customer.leadId,
        contactId: customer.contactId,
        subject: `Assistant replied to ${customer.name}: ${inbound.subject ?? "(no subject)"}`,
        notes: body,
        outcome: "sent",
      });
    }
    return;
  }
  await Repo.insertMessage({
    organizationId,
    accountId: account.id,
    threadId: threadRow.id,
    externalMessageId: null,
    direction: "draft",
    fromAddress: account.address,
    toAddresses: [inbound.fromAddress],
    subject: inbound.subject,
    textBody: body,
    htmlBody: null,
    status: "draft",
    authoredBy: ASSISTANT,
    occurredAt: new Date().toISOString(),
  });
  await Repo.setThreadStatus(organizationId, threadRow.id, "pending");
  if (customer && holdReason) {
    await handToTeam(organizationId, customer, inbound, holdReason);
  }
}

/**
 * A new email from outside: read its photos, note it on the customer's lead,
 * then let the assistant answer. Each step is kept to itself so a failed
 * reading never costs the reply, and a failed reply never costs the mail.
 */
async function onInbound(
  account: EmailAccountRow,
  threadRow: EmailThreadRow,
  inbound: EmailMessageRow,
  attachments: readonly InboundAttachment[],
) {
  const notes = await readInbound(account, inbound, attachments);
  const customer = await customerFor(account.organizationId, inbound, notes);
  if (customer) {
    await Customers.journal({
      organizationId: account.organizationId,
      leadId: customer.leadId,
      contactId: customer.contactId,
      subject: `Email from ${customer.name}: ${inbound.subject ?? "(no subject)"}`,
      notes: [
        (inbound.textBody ?? "").slice(0, 1500),
        notes ? `Attachments show:\n${notes}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      outcome: null,
    });
  }
  await replyWithAssistant(account, threadRow, inbound, customer);
}

export const EmailAssistantService = { onInbound };

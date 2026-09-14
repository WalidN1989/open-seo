import { BusinessAuditRepository } from "@/server/features/business-modules/repositories/BusinessAuditRepository";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { LeadDetailRepository } from "@/server/features/crm/repositories/LeadDetailRepository";
import { EmailSendService } from "@/server/features/email/services/EmailSendService";
import { formatMoney } from "@/server/features/invoicing/invoiceTotals";
import { AppError } from "@/server/lib/errors";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { composeQuoteEmail, toBase64 } from "../quoteEmail";
import { renderQuotePdf } from "../quotePdf";
import { todayIso } from "../quoteRules";
import { QuoteFlowService } from "./QuoteFlowService";
import { QUOTE_MODULE, QuoteService } from "./QuoteService";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The PDF for a quote, for the download link and the email attachment. */
async function pdfFor(organizationId: string, quoteId: string) {
  const detail = await QuoteService.detailForClaims(organizationId, quoteId);
  const bytes = await renderQuotePdf(detail);
  return { bytes, filename: `${detail.quote.number}.pdf`, detail };
}

async function firstNameFor(organizationId: string, leadId: string | null) {
  if (!leadId) return null;
  const lead = await LeadDetailRepository.getLead(organizationId, leadId);
  return lead?.contact?.firstName ?? null;
}

/**
 * Email a quote from the business's own mailbox: a link to view it, a link to
 * the PDF, and the PDF attached. A draft becomes sent, which journals it on
 * the lead and sets the follow-up, exactly as marking it sent by hand does.
 */
async function emailQuote(
  organizationId: string,
  userId: string,
  input: { quoteId: string; to?: string | null; message?: string | null },
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    QUOTE_MODULE,
    "manage",
  );
  const { quote } = await QuoteService.detail(
    organizationId,
    userId,
    input.quoteId,
  );
  const to = (input.to ?? quote.clientEmail ?? "").trim();
  if (!EMAIL_PATTERN.test(to)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "This quote has no valid email address to send to.",
    );
  }
  if (quote.status === "declined" || quote.status === "expired") {
    throw new AppError(
      "VALIDATION_ERROR",
      `A ${quote.status} quote can't be emailed. Move it back to draft and update it first.`,
    );
  }
  if (quote.validUntil < todayIso()) {
    throw new AppError(
      "VALIDATION_ERROR",
      "This quote's valid-until date has passed. Edit the date before sending it.",
    );
  }

  const [link, pdf, firstName] = await Promise.all([
    QuoteFlowService.documentLink(organizationId, userId, quote.id),
    pdfFor(organizationId, quote.id),
    firstNameFor(organizationId, quote.leadId),
  ]);
  const appUrl = ((await getOptionalEnvValue("BETTER_AUTH_URL")) ?? "").replace(
    /\/+$/,
    "",
  );
  const issuer = pdf.detail.issuer;
  const email = composeQuoteEmail({
    businessName: issuer.legalName || "us",
    firstName,
    number: quote.number,
    title: quote.title,
    total: `${formatMoney(quote.totalMinor, quote.currency)} ${quote.currency}`,
    validUntil: quote.validUntil,
    viewUrl: `${appUrl}${link.path}`,
    pdfUrl: `${appUrl}${link.pdfPath}`,
    message: input.message ?? null,
    footer: [issuer.legalName, issuer.phone, issuer.email]
      .filter(Boolean)
      .join(" · "),
  });

  const sent = await EmailSendService.sendFromConnectedMailbox(organizationId, {
    to,
    subject: email.subject,
    text: email.text,
    html: email.html,
    authoredBy: userId,
    attachments: [
      {
        filename: pdf.filename,
        contentType: "application/pdf",
        contentBase64: toBase64(pdf.bytes),
      },
    ],
  });
  if (!sent) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Connect a mailbox in the Email module to email quotes from it.",
    );
  }

  const updated =
    quote.status === "draft"
      ? await QuoteFlowService.setStatus(organizationId, userId, {
          quoteId: quote.id,
          status: "sent",
        })
      : quote;
  await BusinessAuditRepository.record({
    organizationId,
    actorUserId: userId,
    action: "quote.emailed",
    targetType: "quote",
    targetId: quote.id,
    metadata: { number: quote.number, to, from: sent.from },
  });
  return { quote: updated, to, from: sent.from };
}

export const QuoteEmailService = { emailQuote, pdfFor };

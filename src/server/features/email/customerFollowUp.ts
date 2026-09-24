/**
 * How the email assistant treats a customer: someone in the CRM with an open
 * enquiry, often a quote already in their inbox. Pure, so the rules that
 * decide whether a reply goes out on its own are tested without a mailbox.
 */

type CustomerQuote = {
  number: string;
  status: string;
  total: string;
  validUntil: string;
  sentAt: string | null;
  lines: { description: string; quantity: number; amount: string }[];
};

type CustomerBriefInput = {
  name: string;
  leadTitle: string;
  quote: CustomerQuote | null;
  attachmentNotes: string | null;
};

/** The facts about this customer the reply may rely on. */
export function customerBrief(input: CustomerBriefInput) {
  const quote = input.quote
    ? [
        `Their latest quotation: ${input.quote.number}, status ${input.quote.status}, total ${input.quote.total}, valid until ${input.quote.validUntil}${input.quote.sentAt ? `, emailed ${input.quote.sentAt.slice(0, 10)}` : ""}.`,
        ...input.quote.lines.map(
          (line) => `- ${line.quantity} x ${line.description}: ${line.amount}`,
        ),
      ].join("\n")
    : "No quotation has been sent to them yet.";
  return [
    "## This customer",
    `${input.name} is a customer with an open enquiry: ${input.leadTitle}.`,
    quote,
    input.attachmentNotes
      ? `What the photos or documents they attached show (read by an assistant, not measured on site):\n${input.attachmentNotes}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** What the reply to a customer may and may not do on the team's behalf. */
export const CUSTOMER_RULES = `## Replying to a customer
- Answer their questions using only the trusted business context, this customer's details and their quotation. Refer to the quotation by its number.
- If they sent photos or documents, acknowledge them and use what they show, but never state measurements or conditions as confirmed.
- End by moving things forward: ask whether they have any other questions, or whether they would like to go ahead.
- Never change a price, offer a discount, agree payment terms, promise a start date or booking, or accept the job on the team's behalf.
- Call flag_for_team with a short reason, and write only a brief, warm holding reply, when the customer: wants to go ahead or accept, asks for a discount or negotiates, asks for something outside the quotation that needs pricing, complains or is unhappy, asks to speak to a person, or asks anything you cannot answer from the trusted context.`;

const AUTOMATED_SUBJECT =
  /^(auto(matic)?[ -]?reply|out of (the )?office|autoreply|auto:|undeliverable|delivery status notification|mail delivery (failed|subsystem))/i;

/** Out-of-office and bounce messages get no answer, or two robots talk forever. */
export function looksAutomated(subject: string | null, from: string) {
  return (
    AUTOMATED_SUBJECT.test((subject ?? "").replace(/^(re|fw|fwd):\s*/i, "")) ||
    /^(mailer-daemon|postmaster|no-?reply|donotreply)@/i.test(from.trim())
  );
}

/**
 * Two assistant replies in the last day with nothing from a person between
 * them is enough: a third goes to the team instead of out.
 */
export function assistantKeepsReplying(
  history: readonly {
    direction: string;
    authoredBy: string | null;
    occurredAt: string;
  }[],
  now = Date.now(),
) {
  const dayAgo = now - 24 * 60 * 60 * 1000;
  let count = 0;
  for (const message of history.toSorted((a, b) =>
    b.occurredAt.localeCompare(a.occurredAt),
  )) {
    if (message.direction !== "outbound") continue;
    if (message.authoredBy !== "assistant") break;
    if (Date.parse(message.occurredAt) < dayAgo) break;
    count += 1;
  }
  return count >= 2;
}

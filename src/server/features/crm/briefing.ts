import { formatMoney } from "@/server/features/invoicing/invoiceTotals";

/**
 * The business briefing an agent reads twice a day: what needs a person
 * first, then what happened, then what is still waiting on a customer. Pure,
 * so what counts as "needs you" is tested without a database.
 */

type Row<T> = readonly T[];

export type BriefingData = {
  since: string;
  now: string;
  calls: Row<{
    at: string;
    name: string | null;
    summary: string | null;
    capturedJson: string;
  }>;
  newLeads: Row<{ title: string; source: string | null; name: string | null }>;
  emails: Row<{
    direction: string;
    from: string;
    to: string;
    subject: string | null;
    authoredBy: string | null;
    hasAttachments: boolean;
    at: string;
  }>;
  draftsWaiting: Row<{ to: string; subject: string | null; at: string }>;
  quotes: Row<{
    number: string;
    status: string;
    clientName: string;
    totalMinor: number;
    currency: string;
    sentAt: string | null;
    respondedAt: string | null;
    validUntil: string;
    chaseCount: number;
    createdAt: string;
  }>;
  followUpsDue: Row<{
    title: string;
    nextAction: string | null;
    nextActionDue: string | null;
    name: string | null;
  }>;
  remindersWaiting: Row<{
    title: string;
    note: string | null;
    remindAt: string;
  }>;
  whatsapp: { messages: number; chats: number; waitingForPerson: number };
};

const DAY_MS = 24 * 60 * 60 * 1000;

function need(capturedJson: string) {
  try {
    const parsed: unknown = JSON.parse(capturedJson);
    if (parsed && typeof parsed === "object") {
      const value: unknown = Reflect.get(parsed, "service_interest");
      if (typeof value === "string") return value;
    }
  } catch {
    // An unreadable capture just has no need to show.
  }
  return null;
}

function firstAddress(json: string) {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) && typeof parsed[0] === "string"
      ? parsed[0]
      : "";
  } catch {
    return "";
  }
}

const money = (quote: { totalMinor: number; currency: string }) =>
  `${formatMoney(quote.totalMinor, quote.currency)} ${quote.currency}`;

function section(title: string, lines: string[], empty: string) {
  return `${title}\n${lines.length ? lines.map((line) => `- ${line}`).join("\n") : `- ${empty}`}`;
}

export function buildBriefing(data: BriefingData) {
  const now = Date.parse(data.now);
  const today = data.now.slice(0, 10);
  const inWindow = (at: string | null) => Boolean(at && at > data.since);
  const days = (at: string) => Math.floor((now - Date.parse(at)) / DAY_MS);

  const accepted = data.quotes.filter(
    (quote) => quote.status === "accepted" && inWindow(quote.respondedAt),
  );
  const declined = data.quotes.filter(
    (quote) => quote.status === "declined" && inWindow(quote.respondedAt),
  );
  const awaiting = data.quotes.filter((quote) => quote.status === "sent");
  const expiringSoon = awaiting.filter(
    (quote) =>
      quote.validUntil >= today &&
      Date.parse(`${quote.validUntil}T23:59:59Z`) - now <= 7 * DAY_MS,
  );
  const unsentDrafts = data.quotes.filter(
    (quote) =>
      quote.status === "draft" && now - Date.parse(quote.createdAt) > 3_600_000,
  );

  const needsYou = [
    ...data.remindersWaiting.map(
      (reminder) =>
        `Reminder: ${reminder.title}${reminder.note ? ` — ${reminder.note}` : ""}`,
    ),
    ...accepted.map(
      (quote) =>
        `${quote.clientName} accepted ${quote.number} (${money(quote)}): arrange the next steps and payment.`,
    ),
    ...data.draftsWaiting.map(
      (draft) =>
        `Email reply waiting for approval to ${firstAddress(draft.to)}: ${draft.subject ?? "(no subject)"}`,
    ),
    ...(data.whatsapp.waitingForPerson
      ? [
          `${data.whatsapp.waitingForPerson} WhatsApp chat(s) waiting for a person.`,
        ]
      : []),
    ...unsentDrafts.map(
      (quote) =>
        `Draft quote ${quote.number} for ${quote.clientName} (${money(quote)}) hasn't been sent.`,
    ),
    ...data.followUpsDue.map(
      (lead) =>
        `Follow-up due${lead.nextActionDue ? ` ${lead.nextActionDue.slice(0, 10)}` : ""}: ${lead.name?.trim() || lead.title}${lead.nextAction ? ` — ${lead.nextAction}` : ""}`,
    ),
    ...expiringSoon.map(
      (quote) =>
        `${quote.number} for ${quote.clientName} expires ${quote.validUntil} with no answer yet.`,
    ),
  ];

  const inbound = data.emails.filter((email) => email.direction === "inbound");
  const assistantReplies = data.emails.filter(
    (email) =>
      email.direction === "outbound" && email.authoredBy === "assistant",
  );
  const followUps = data.emails.filter(
    (email) =>
      email.direction === "outbound" &&
      email.authoredBy === "assistant:quote-follow-up",
  );
  const sentQuotes = data.quotes.filter((quote) => inWindow(quote.sentAt));

  const happened = [
    ...data.calls.map(
      (call) =>
        `Call from ${call.name?.trim() || "an unknown caller"}${need(call.capturedJson) ? ` about ${need(call.capturedJson)}` : ""}.`,
    ),
    ...data.newLeads.map(
      (lead) =>
        `New lead: ${lead.title}${lead.source ? ` (${lead.source})` : ""}.`,
    ),
    ...inbound.map(
      (email) =>
        `Email from ${email.from}: ${email.subject ?? "(no subject)"}${email.hasAttachments ? " (with photos or documents)" : ""}.`,
    ),
    ...(assistantReplies.length
      ? [`The assistant answered ${assistantReplies.length} customer email(s).`]
      : []),
    ...sentQuotes.map(
      (quote) =>
        `Quote ${quote.number} sent to ${quote.clientName} (${money(quote)}).`,
    ),
    ...(followUps.length
      ? [`${followUps.length} quote follow-up email(s) sent.`]
      : []),
    ...declined.map((quote) => `${quote.clientName} declined ${quote.number}.`),
    ...(data.whatsapp.messages
      ? [
          `${data.whatsapp.messages} WhatsApp message(s) in from ${data.whatsapp.chats} chat(s).`,
        ]
      : []),
  ];

  const waitingOnCustomers = awaiting.map(
    (quote) =>
      `${quote.number} · ${quote.clientName} · ${money(quote)} · sent ${quote.sentAt ? `${days(quote.sentAt)} day(s) ago` : "by hand"} · ${quote.chaseCount >= 3 ? "follow-ups finished" : `${Math.min(quote.chaseCount, 2)} follow-up(s) sent`} · valid until ${quote.validUntil}`,
  );

  return {
    needsYou,
    happened,
    waitingOnCustomers,
    text: [
      `Briefing for ${data.since.slice(0, 16).replace("T", " ")} to ${data.now.slice(0, 16).replace("T", " ")} (UTC)`,
      section("Needs you", needsYou, "Nothing is waiting on you."),
      section("What happened", happened, "Nothing new came in."),
      section(
        "Waiting on customers",
        waitingOnCustomers,
        "No quotes are waiting for an answer.",
      ),
    ].join("\n\n"),
  };
}

import type { LeadDetail } from "./useLeadDetail";

export type JournalEntry = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  outcome: string | null;
  at: string;
  /** Written by the app (a call, an automation), not typed by a person. */
  automated: boolean;
};

const FIVE_MINUTES = 5 * 60_000;

function whatsappEntry(message: LeadDetail["whatsapp"][number]): JournalEntry {
  const inbound = message.direction === "inbound";
  return {
    id: `wa:${message.id}`,
    kind: "whatsapp",
    title: inbound ? "WhatsApp received" : "WhatsApp sent",
    body: message.body,
    outcome: inbound ? null : message.status === "failed" ? "failed" : null,
    at: message.sentAt ?? message.createdAt,
    automated: true,
  };
}

function smsEntry(message: LeadDetail["sms"][number]): JournalEntry {
  const inbound = message.direction === "inbound";
  return {
    id: `sms:${message.id}`,
    kind: "sms",
    title: inbound ? "SMS received" : "SMS sent",
    body: message.body,
    outcome: inbound ? null : message.status === "failed" ? "failed" : null,
    at: message.occurredAt,
    automated: true,
  };
}

function emailEntry(message: LeadDetail["emails"][number]): JournalEntry {
  const inbound = message.direction === "inbound";
  return {
    id: `em:${message.id}`,
    kind: "email",
    title: `${inbound ? "Email received" : "Email sent"}${
      message.subject ? `: ${message.subject}` : ""
    }`,
    body: message.textBody ? message.textBody.slice(0, 600) : null,
    outcome: inbound ? null : message.status === "failed" ? "failed" : "sent",
    at: message.occurredAt,
    automated: true,
  };
}

/**
 * One timeline from the journal, the WhatsApp thread and the mailbox, newest
 * first. The recap email is logged twice by nature (the activity that says it
 * fired, and the message itself), so the activity yields to the message when
 * both exist.
 */
export function buildJournal(detail: LeadDetail): JournalEntry[] {
  const emails = detail.emails.map(emailEntry);
  const emailTimes = detail.emails
    .filter((message) => message.direction !== "inbound")
    .map((message) => new Date(message.occurredAt).getTime());
  const activities = detail.activities
    .filter((activity) => {
      if (activity.activityType !== "email" || activity.createdByMemberId) {
        return true;
      }
      const at = new Date(activity.occurredAt).getTime();
      return !emailTimes.some((time) => Math.abs(time - at) < FIVE_MINUTES);
    })
    .map(
      (activity): JournalEntry => ({
        id: `ac:${activity.id}`,
        kind: activity.activityType,
        title: activity.subject,
        body: activity.notes,
        outcome: activity.outcome,
        at: activity.occurredAt,
        automated: !activity.createdByMemberId,
      }),
    );
  return [
    ...activities,
    ...detail.whatsapp.map(whatsappEntry),
    ...detail.sms.map(smsEntry),
    ...emails,
  ].toSorted((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export type OutreachResult = {
  state: "sent" | "failed";
  at: string;
  detail: string | null;
};

function fromStatus(status: string | null, at: string): OutreachResult | null {
  if (!status || status.startsWith("skipped")) return null;
  return {
    state: status.startsWith("sent") ? "sent" : "failed",
    at,
    detail: status,
  };
}

/**
 * Whether the automated WhatsApp and email reached this lead, and when. The
 * journal entry is the record for calls since outreach was journalled; the
 * call's own status covers the ones before.
 */
export function outreachState(detail: LeadDetail) {
  const latest = (kind: "whatsapp" | "email"): OutreachResult | null => {
    let fromActivity: OutreachResult | null = null;
    for (const entry of detail.activities) {
      const outcome = entry.outcome;
      if (
        entry.activityType === kind &&
        !entry.createdByMemberId &&
        (outcome === "sent" || outcome === "failed")
      ) {
        fromActivity = {
          state: outcome,
          at: entry.occurredAt,
          detail: entry.notes,
        };
        break;
      }
    }
    const fromCall =
      detail.calls
        .map((call) =>
          fromStatus(
            kind === "whatsapp" ? call.welcomeStatus : call.recapEmailStatus,
            call.createdAt,
          ),
        )
        .find(Boolean) ?? null;
    if (!fromActivity) return fromCall;
    if (!fromCall) return fromActivity;
    return new Date(fromCall.at) > new Date(fromActivity.at)
      ? fromCall
      : fromActivity;
  };
  return {
    whatsapp: latest("whatsapp"),
    email: latest("email"),
    call: detail.calls[0] ?? null,
  };
}

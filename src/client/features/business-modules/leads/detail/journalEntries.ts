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
    ...emails,
  ].toSorted((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

/** Whether the automated WhatsApp and email reached this lead, and when. */
export function outreachState(detail: LeadDetail) {
  const latest = (kind: "whatsapp" | "email") =>
    detail.activities.find(
      (activity) =>
        activity.activityType === kind &&
        !activity.createdByMemberId &&
        (activity.outcome === "sent" || activity.outcome === "failed"),
    ) ?? null;
  const call = detail.calls[0] ?? null;
  return {
    whatsapp: latest("whatsapp"),
    email: latest("email"),
    call,
    lastInboundWhatsapp:
      detail.whatsapp.find((message) => message.direction === "inbound") ??
      null,
  };
}

import { EmailRepository as Repo } from "../repositories/EmailRepository";
import { requireConnectedAccount } from "./EmailService";

/**
 * Send something the app wrote (a report link, say) from the business's own
 * connected mailbox, and mirror it as a thread so the customer's reply lands
 * in the Email module next to it. Returns null when there is no connected
 * account, so callers can fall back to transactional mail.
 *
 * Access is the caller's job: this is reached from features that already
 * checked their own permission, not from a user-facing server function.
 */
async function sendFromConnectedMailbox(
  organizationId: string,
  input: {
    to: string;
    subject: string;
    text: string;
    html?: string;
    authoredBy: string | null;
  },
) {
  const account = await Repo.getAccount(organizationId);
  if (!account || account.status !== "connected") return null;
  const { outbound } = await requireConnectedAccount(organizationId);
  const sent = await outbound.compose(input);
  const occurredAt = new Date().toISOString();
  const threadRow = await Repo.upsertThread(account, {
    externalThreadId: sent.thread_id,
    subject: input.subject,
    preview: input.text.slice(0, 160),
    senders: [account.address],
    recipients: [input.to],
    messageCount: 1,
    lastMessageAt: occurredAt,
  });
  await Repo.insertMessage({
    organizationId,
    accountId: account.id,
    threadId: threadRow.id,
    externalMessageId: sent.message_id,
    direction: "outbound",
    fromAddress: account.address,
    toAddresses: [input.to],
    subject: input.subject,
    textBody: input.text,
    htmlBody: input.html ?? null,
    status: "sent",
    authoredBy: input.authoredBy,
    occurredAt,
  });
  return {
    messageId: sent.message_id,
    threadId: threadRow.id,
    from: account.address,
  };
}

export const EmailSendService = { sendFromConnectedMailbox };

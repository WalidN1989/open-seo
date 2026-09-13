import type { z } from "zod";
import { AppError } from "@/server/lib/errors";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import type {
  approveEmailDraftSchema,
  composeEmailSchema,
  sendEmailReplySchema,
  setEmailThreadStatusSchema,
} from "@/types/schemas/email";
import { outboundFor } from "../providers/outbound";
import { cleanRecipients } from "../providers/threading";
import {
  EmailRepository as Repo,
  type EmailAccountRow,
  type EmailThreadRow,
} from "../repositories/EmailRepository";
import { audit, providerFailure, publicAccount } from "./EmailAccountService";

const MODULE = "email" as const;

export function parseList(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

/** Cc and Bcc cleaned against the sender and the To, so nobody gets it twice. */
export function copiesFor(
  own: string,
  to: readonly string[],
  input: { cc?: string[]; bcc?: string[] },
) {
  const cc = cleanRecipients(input.cc, [own, ...to]);
  const bcc = cleanRecipients(input.bcc, [own, ...to, ...cc]);
  return { cc, bcc };
}

export async function requireConnectedAccount(organizationId: string) {
  const account = await Repo.getAccount(organizationId);
  if (!account || account.status !== "connected") {
    throw new AppError("VALIDATION_ERROR", "Connect an email account first.");
  }
  return { account, outbound: await outboundFor(account) };
}

async function workspace(organizationId: string, userId: string) {
  await BusinessModuleService.requireAccess(organizationId, userId, MODULE);
  const [account, threads, drafts] = await Promise.all([
    Repo.getAccount(organizationId),
    Repo.listThreads(organizationId),
    Repo.listDrafts(organizationId),
  ]);
  return {
    account: publicAccount(account),
    threads: threads.map((thread) => ({
      ...thread,
      senders: parseList(thread.senders),
      recipients: parseList(thread.recipients),
    })),
    drafts: drafts.map((draft) => ({
      ...draft,
      toAddresses: parseList(draft.toAddresses),
      ccAddresses: parseList(draft.ccAddresses),
      bccAddresses: parseList(draft.bccAddresses),
    })),
  };
}

async function threadDetail(
  organizationId: string,
  userId: string,
  threadId: string,
) {
  await BusinessModuleService.requireAccess(organizationId, userId, MODULE);
  const row = await Repo.getThread(organizationId, threadId);
  if (!row) throw new AppError("NOT_FOUND", "Thread not found.");
  const messages = await Repo.listMessages(organizationId, threadId);
  return {
    thread: {
      ...row,
      senders: parseList(row.senders),
      recipients: parseList(row.recipients),
    },
    messages: messages.map((message) => ({
      ...message,
      toAddresses: parseList(message.toAddresses),
      ccAddresses: parseList(message.ccAddresses),
      bccAddresses: parseList(message.bccAddresses),
    })),
  };
}

async function setThreadStatus(
  organizationId: string,
  userId: string,
  input: z.infer<typeof setEmailThreadStatusSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    MODULE,
    "manage",
  );
  const row = await Repo.setThreadStatus(
    organizationId,
    input.threadId,
    input.status,
  );
  if (!row) throw new AppError("NOT_FOUND", "Thread not found.");
  return row;
}

export async function recordOutbound(
  account: EmailAccountRow,
  threadRow: EmailThreadRow,
  sent: { message_id: string; thread_id: string },
  input: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string | null;
    text: string;
    authoredBy: string | null;
  },
) {
  const occurredAt = new Date().toISOString();
  await Repo.insertMessage({
    organizationId: account.organizationId,
    accountId: account.id,
    threadId: threadRow.id,
    externalMessageId: sent.message_id,
    direction: "outbound",
    fromAddress: account.address,
    toAddresses: input.to,
    ccAddresses: input.cc ?? [],
    bccAddresses: input.bcc ?? [],
    subject: input.subject,
    textBody: input.text,
    htmlBody: null,
    status: "sent",
    authoredBy: input.authoredBy,
    occurredAt,
  });
  await Repo.upsertThread(account, {
    externalThreadId: threadRow.externalThreadId,
    subject: threadRow.subject,
    preview: input.text.slice(0, 160),
    senders: parseList(threadRow.senders),
    recipients: parseList(threadRow.recipients),
    messageCount: threadRow.messageCount + 1,
    lastMessageAt: occurredAt,
    lastDirection: "outbound",
  });
}

async function sendReply(
  organizationId: string,
  userId: string,
  input: z.infer<typeof sendEmailReplySchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    MODULE,
    "manage",
  );
  const { account, outbound } = await requireConnectedAccount(organizationId);
  const threadRow = await Repo.getThread(organizationId, input.threadId);
  if (!threadRow) throw new AppError("NOT_FOUND", "Thread not found.");
  const last = await Repo.lastInboundMessage(threadRow.id);
  if (!last) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Nothing to reply to in this thread yet.",
    );
  }
  const copies = copiesFor(account.address, [last.fromAddress], input);
  const sent = await outbound
    .reply({ thread: threadRow, last, text: input.text, ...copies })
    .catch(providerFailure);
  await recordOutbound(account, threadRow, sent, {
    to: [last.fromAddress],
    ...copies,
    subject: last.subject,
    text: input.text,
    authoredBy: userId,
  });
  await audit(organizationId, userId, "email.reply.sent", threadRow.id);
  return { messageId: sent.message_id };
}

async function compose(
  organizationId: string,
  userId: string,
  input: z.infer<typeof composeEmailSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    MODULE,
    "manage",
  );
  const { account, outbound } = await requireConnectedAccount(organizationId);
  const copies = copiesFor(account.address, [input.to], input);
  const sent = await outbound
    .compose({
      to: input.to,
      subject: input.subject,
      text: input.text,
      ...copies,
    })
    .catch(providerFailure);
  const occurredAt = new Date().toISOString();
  const threadRow = await Repo.upsertThread(account, {
    externalThreadId: sent.thread_id,
    subject: input.subject,
    preview: input.text.slice(0, 160),
    senders: [input.to],
    recipients: [account.address],
    messageCount: 1,
    lastMessageAt: occurredAt,
    lastDirection: "outbound",
  });
  await Repo.insertMessage({
    organizationId,
    accountId: account.id,
    threadId: threadRow.id,
    externalMessageId: sent.message_id,
    direction: "outbound",
    fromAddress: account.address,
    toAddresses: [input.to],
    ccAddresses: copies.cc,
    bccAddresses: copies.bcc,
    subject: input.subject,
    textBody: input.text,
    htmlBody: null,
    status: "sent",
    authoredBy: userId,
    occurredAt,
  });
  await audit(organizationId, userId, "email.message.sent", threadRow.id);
  return { threadId: threadRow.id, messageId: sent.message_id };
}

/** Send an assistant draft, possibly edited, as a reply on its thread. */
async function approveDraft(
  organizationId: string,
  userId: string,
  input: z.infer<typeof approveEmailDraftSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    MODULE,
    "manage",
  );
  const draft = await Repo.getMessage(organizationId, input.messageId);
  if (!draft || draft.direction !== "draft") {
    throw new AppError("NOT_FOUND", "Draft not found.");
  }
  const text = input.text ?? draft.textBody ?? "";
  if (!text.trim())
    throw new AppError("VALIDATION_ERROR", "The draft is empty.");
  const { account, outbound } = await requireConnectedAccount(organizationId);
  const threadRow = await Repo.getThread(organizationId, draft.threadId);
  if (!threadRow) throw new AppError("NOT_FOUND", "Thread not found.");
  const last = await Repo.lastInboundMessage(draft.threadId);
  const to = parseList(draft.toAddresses)[0];
  if (!last && !to) {
    throw new AppError("VALIDATION_ERROR", "The draft has no recipient.");
  }
  // Copies as drafted, unless the person edited them before approving.
  const copies = copiesFor(account.address, [last?.fromAddress ?? to ?? ""], {
    cc: input.cc ?? parseList(draft.ccAddresses),
    bcc: input.bcc ?? parseList(draft.bccAddresses),
  });
  // A drafted reply answers the last inbound message; a drafted new email
  // starts the conversation, and the thread then takes the provider's id.
  const sent = last
    ? await outbound
        .reply({ thread: threadRow, last, text, ...copies })
        .catch(providerFailure)
    : await outbound
        .compose({
          to: to ?? "",
          subject: draft.subject ?? "",
          text,
          ...copies,
        })
        .catch(providerFailure);
  if (!last) await Repo.setThreadExternalId(threadRow.id, sent.thread_id);
  const occurredAt = new Date().toISOString();
  await Repo.updateMessage(organizationId, draft.id, {
    externalMessageId: sent.message_id,
    direction: "outbound",
    status: "sent",
    textBody: text,
    occurredAt,
    ccAddresses: copies.cc,
    bccAddresses: copies.bcc,
  });
  await Repo.upsertThread(account, {
    externalThreadId: last ? threadRow.externalThreadId : sent.thread_id,
    subject: threadRow.subject,
    preview: text.slice(0, 160),
    senders: parseList(threadRow.senders),
    recipients: parseList(threadRow.recipients),
    messageCount: threadRow.messageCount + 1,
    lastMessageAt: occurredAt,
    lastDirection: "outbound",
  });
  await audit(organizationId, userId, "email.draft.approved", draft.id, {
    edited: input.text !== undefined,
  });
  return { messageId: sent.message_id };
}

async function discardDraft(
  organizationId: string,
  userId: string,
  messageId: string,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    MODULE,
    "manage",
  );
  const draft = await Repo.getMessage(organizationId, messageId);
  if (!draft || draft.direction !== "draft") {
    throw new AppError("NOT_FOUND", "Draft not found.");
  }
  await Repo.deleteMessage(organizationId, messageId);
  await audit(organizationId, userId, "email.draft.discarded", messageId);
  return { deleted: true };
}

export const EmailService = {
  workspace,
  thread: threadDetail,
  setThreadStatus,
  sendReply,
  compose,
  approveDraft,
  discardDraft,
};

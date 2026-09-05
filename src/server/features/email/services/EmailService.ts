import type { z } from "zod";
import { AppError } from "@/server/lib/errors";
import { decryptCredentials } from "@/server/lib/connection-secrets";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import type {
  approveEmailDraftSchema,
  composeEmailSchema,
  sendEmailReplySchema,
  setEmailThreadStatusSchema,
} from "@/types/schemas/email";
import { agentmailClient } from "../providers/agentmail";
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

async function requireConnectedAccount(organizationId: string) {
  const account = await Repo.getAccount(organizationId);
  if (!account || account.status !== "connected" || !account.inboxId) {
    throw new AppError("VALIDATION_ERROR", "Connect an email account first.");
  }
  const creds = await decryptCredentials(account.credentials);
  const apiKey = creds.API_KEY;
  if (!apiKey) {
    throw new AppError(
      "VALIDATION_ERROR",
      "The account has no stored API key. Reconnect it.",
    );
  }
  return { account, apiKey, inboxId: account.inboxId };
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
    drafts,
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
  const { account, apiKey, inboxId } =
    await requireConnectedAccount(organizationId);
  const threadRow = await Repo.getThread(organizationId, input.threadId);
  if (!threadRow) throw new AppError("NOT_FOUND", "Thread not found.");
  const last = await Repo.lastInboundMessage(threadRow.id);
  if (!last?.externalMessageId) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Nothing to reply to in this thread yet.",
    );
  }
  const sent = await agentmailClient(apiKey)
    .replyToMessage(inboxId, last.externalMessageId, { text: input.text })
    .catch(providerFailure);
  await recordOutbound(account, threadRow, sent, {
    to: [last.fromAddress],
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
  const { account, apiKey, inboxId } =
    await requireConnectedAccount(organizationId);
  const sent = await agentmailClient(apiKey)
    .sendMessage(inboxId, {
      to: [input.to],
      subject: input.subject,
      text: input.text,
    })
    .catch(providerFailure);
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
  const { account, apiKey, inboxId } =
    await requireConnectedAccount(organizationId);
  const threadRow = await Repo.getThread(organizationId, draft.threadId);
  const last = await Repo.lastInboundMessage(draft.threadId);
  if (!threadRow || !last?.externalMessageId) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Nothing to reply to in this thread.",
    );
  }
  const sent = await agentmailClient(apiKey)
    .replyToMessage(inboxId, last.externalMessageId, { text })
    .catch(providerFailure);
  const occurredAt = new Date().toISOString();
  await Repo.updateMessage(organizationId, draft.id, {
    externalMessageId: sent.message_id,
    direction: "outbound",
    status: "sent",
    textBody: text,
    occurredAt,
  });
  await Repo.upsertThread(account, {
    externalThreadId: threadRow.externalThreadId,
    subject: threadRow.subject,
    preview: text.slice(0, 160),
    senders: parseList(threadRow.senders),
    recipients: parseList(threadRow.recipients),
    messageCount: threadRow.messageCount + 1,
    lastMessageAt: occurredAt,
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

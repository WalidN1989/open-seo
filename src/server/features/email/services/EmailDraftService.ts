import type { z } from "zod";
import { AppError } from "@/server/lib/errors";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import type {
  draftEmailReplySchema,
  draftEmailSchema,
} from "@/types/schemas/email";
import { EmailRepository as Repo } from "../repositories/EmailRepository";
import { audit } from "./EmailAccountService";
import { copiesFor } from "./EmailService";

const MODULE = "email" as const;

/**
 * Drafts an agent writes for a person to approve. Nothing here sends: a
 * draft sits under Drafts (and on its thread with direction "draft") until
 * someone approves it in the UI, which is the same path assistant drafts
 * take. One draft per thread; saving again replaces it.
 */

async function requireAccount(organizationId: string, userId: string) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    MODULE,
    "manage",
  );
  const account = await Repo.getAccount(organizationId);
  if (!account || account.status !== "connected") {
    throw new AppError("VALIDATION_ERROR", "Connect an email account first.");
  }
  return account;
}

async function saveReplyDraft(
  organizationId: string,
  userId: string,
  input: z.infer<typeof draftEmailReplySchema>,
  authoredBy: string,
) {
  const account = await requireAccount(organizationId, userId);
  const thread = await Repo.getThread(organizationId, input.threadId);
  if (!thread) throw new AppError("NOT_FOUND", "Thread not found.");
  const last = await Repo.lastInboundMessage(thread.id);
  if (!last) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Nothing to reply to on this thread yet.",
    );
  }
  const copies = copiesFor(account.address, [last.fromAddress], input);
  const existing = await Repo.draftOnThread(organizationId, thread.id);
  const draft = existing
    ? await Repo.updateMessage(organizationId, existing.id, {
        textBody: input.text,
        occurredAt: new Date().toISOString(),
        ccAddresses: copies.cc,
        bccAddresses: copies.bcc,
      })
    : await Repo.insertMessage({
        organizationId,
        accountId: account.id,
        threadId: thread.id,
        externalMessageId: null,
        direction: "draft",
        fromAddress: account.address,
        toAddresses: [last.fromAddress],
        ccAddresses: copies.cc,
        bccAddresses: copies.bcc,
        subject: last.subject,
        textBody: input.text,
        htmlBody: null,
        status: "draft",
        authoredBy,
        occurredAt: new Date().toISOString(),
      });
  if (!draft) throw new AppError("NOT_FOUND", "Draft not found.");
  await Repo.setThreadStatus(organizationId, thread.id, "pending");
  await audit(organizationId, userId, "email.draft.saved", draft.id, {
    threadId: thread.id,
    replaced: Boolean(existing),
    authoredBy,
  });
  return {
    threadId: thread.id,
    draftMessageId: draft.id,
    replaced: Boolean(existing),
    ...copies,
  };
}

async function saveComposeDraft(
  organizationId: string,
  userId: string,
  input: z.infer<typeof draftEmailSchema>,
  authoredBy: string,
) {
  const account = await requireAccount(organizationId, userId);
  const copies = copiesFor(account.address, [input.to], input);
  const occurredAt = new Date().toISOString();
  // A thread of its own, keyed by a placeholder until it is sent; approving
  // the draft swaps in the provider's thread id so replies land on it.
  const thread = await Repo.upsertThread(account, {
    externalThreadId: `draft:${crypto.randomUUID()}`,
    subject: input.subject,
    preview: input.text.slice(0, 160),
    senders: [input.to],
    recipients: [account.address],
    messageCount: 0,
    lastMessageAt: occurredAt,
    lastDirection: "outbound",
  });
  const draft = await Repo.insertMessage({
    organizationId,
    accountId: account.id,
    threadId: thread.id,
    externalMessageId: null,
    direction: "draft",
    fromAddress: account.address,
    toAddresses: [input.to],
    ccAddresses: copies.cc,
    bccAddresses: copies.bcc,
    subject: input.subject,
    textBody: input.text,
    htmlBody: null,
    status: "draft",
    authoredBy,
    occurredAt,
  });
  await Repo.setThreadStatus(organizationId, thread.id, "pending");
  await audit(organizationId, userId, "email.draft.saved", draft.id, {
    threadId: thread.id,
    to: input.to,
    authoredBy,
  });
  return {
    threadId: thread.id,
    draftMessageId: draft.id,
    replaced: false,
    ...copies,
  };
}

export const EmailDraftService = { saveReplyDraft, saveComposeDraft };

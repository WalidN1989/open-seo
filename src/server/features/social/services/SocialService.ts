import type { z } from "zod";
import { AppError } from "@/server/lib/errors";
import { decryptCredentials } from "@/server/lib/connection-secrets";
import { BusinessAuditRepository } from "@/server/features/business-modules/repositories/BusinessAuditRepository";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import type {
  approveSocialDraftSchema,
  sendSocialReplySchema,
  setSocialConversationStatusSchema,
} from "@/types/schemas/social";
import {
  fetchParticipantName,
  MetaMessagingError,
  sendSocialMessage,
} from "../providers/meta-messaging";
import {
  SocialRepository as Repo,
  type SocialAccountRow,
  type SocialConversationRow,
} from "../repositories/SocialRepository";
import { publicAccount } from "./SocialAccountService";

const MODULE = "social" as const;

async function audit(
  organizationId: string,
  userId: string,
  action: string,
  targetId: string,
) {
  await BusinessAuditRepository.record({
    organizationId,
    actorUserId: userId,
    action,
    targetType: "social",
    targetId,
  });
}

/** The token and page a send needs, or a message saying what is missing. */
export async function sendableAccount(account: SocialAccountRow) {
  if (account.status !== "connected") {
    throw new AppError("VALIDATION_ERROR", "That account is not connected.");
  }
  const secrets = await decryptCredentials(account.credentials);
  const token = secrets.PAGE_ACCESS_TOKEN;
  if (!token || !account.pageId) {
    throw new AppError(
      "VALIDATION_ERROR",
      "This account has no Page token stored. Reconnect it.",
    );
  }
  return { token, pageId: account.pageId };
}

function providerFailure(error: unknown): never {
  if (error instanceof MetaMessagingError) {
    // Meta's own reason — usually the 24-hour window — is the useful part.
    throw new AppError("INTEGRATION_CHECK_FAILED", error.message);
  }
  throw error;
}

/** At most this many profile lookups per load, so a bad token cannot stall it. */
const NAME_REPAIR_LIMIT = 5;

/**
 * A name is normally resolved the moment a message arrives, but a token that
 * was missing the profile scope at the time leaves the row showing a bare id
 * for ever. Repair a few on load instead of waiting for the person to write
 * again. Costs nothing when every conversation already has a name.
 */
async function repairMissingNames(
  accounts: SocialAccountRow[],
  conversations: SocialConversationRow[],
) {
  const missing = conversations
    .filter((row) => !row.participantName)
    .slice(0, NAME_REPAIR_LIMIT);
  if (!missing.length) return conversations;
  const byId = new Map(accounts.map((account) => [account.id, account]));
  const repaired = new Map<string, string>();
  await Promise.all(
    missing.map(async (conversation) => {
      const account = byId.get(conversation.accountId);
      if (!account) return;
      const { PAGE_ACCESS_TOKEN: token } = await decryptCredentials(
        account.credentials,
      );
      if (!token) return;
      const name = await fetchParticipantName({
        participantId: conversation.participantId,
        token,
        platform: account.platform === "instagram" ? "instagram" : "messenger",
      }).catch(() => null);
      if (!name) return;
      await Repo.setParticipantName(
        account.organizationId,
        conversation.id,
        name,
      );
      repaired.set(conversation.id, name);
    }),
  );
  if (!repaired.size) return conversations;
  return conversations.map((row) => {
    const name = repaired.get(row.id);
    return name ? { ...row, participantName: name } : row;
  });
}

async function workspace(organizationId: string, userId: string) {
  await BusinessModuleService.requireAccess(organizationId, userId, MODULE);
  const [accounts, conversations, drafts] = await Promise.all([
    Repo.listAccounts(organizationId),
    Repo.listConversations(organizationId),
    Repo.listDrafts(organizationId),
  ]);
  return {
    accounts: accounts.map((account) => publicAccount(account)),
    conversations: await repairMissingNames(accounts, conversations),
    drafts,
  };
}

async function thread(
  organizationId: string,
  userId: string,
  conversationId: string,
) {
  await BusinessModuleService.requireAccess(organizationId, userId, MODULE);
  const conversation = await Repo.getConversation(
    organizationId,
    conversationId,
  );
  if (!conversation) throw new AppError("NOT_FOUND", "Conversation not found.");
  const messages = await Repo.listMessages(organizationId, conversationId);
  return { conversation, messages };
}

/** Record an outbound message and move the conversation forward. */
export async function recordOutbound(
  account: SocialAccountRow,
  conversation: SocialConversationRow,
  values: {
    externalMessageId: string | null;
    text: string;
    authoredBy: string | null;
  },
) {
  const occurredAt = new Date().toISOString();
  await Repo.insertMessage({
    organizationId: account.organizationId,
    accountId: account.id,
    conversationId: conversation.id,
    externalMessageId: values.externalMessageId,
    direction: "outbound",
    body: values.text,
    attachmentUrl: null,
    status: "sent",
    authoredBy: values.authoredBy,
    occurredAt,
  });
  await Repo.upsertConversation(account, {
    participantId: conversation.participantId,
    participantName: conversation.participantName,
    preview: values.text.slice(0, 160),
    lastMessageAt: occurredAt,
  });
}

async function sendReply(
  organizationId: string,
  userId: string,
  input: z.infer<typeof sendSocialReplySchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    MODULE,
    "manage",
  );
  const conversation = await Repo.getConversation(
    organizationId,
    input.conversationId,
  );
  if (!conversation) throw new AppError("NOT_FOUND", "Conversation not found.");
  const account = await Repo.getAccount(organizationId, conversation.accountId);
  if (!account) throw new AppError("NOT_FOUND", "Account not found.");
  const { token, pageId } = await sendableAccount(account);
  const sent = await sendSocialMessage({
    pageId,
    token,
    recipientId: conversation.participantId,
    text: input.text,
    fetcher: undefined,
  }).catch(providerFailure);
  await recordOutbound(account, conversation, {
    externalMessageId: sent.externalMessageId,
    text: input.text,
    authoredBy: userId,
  });
  await audit(organizationId, userId, "social.reply.sent", conversation.id);
  return { messageId: sent.externalMessageId };
}

async function approveDraft(
  organizationId: string,
  userId: string,
  input: z.infer<typeof approveSocialDraftSchema>,
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
  const text = input.text ?? draft.body ?? "";
  if (!text.trim())
    throw new AppError("VALIDATION_ERROR", "The draft is empty.");
  const conversation = await Repo.getConversation(
    organizationId,
    draft.conversationId,
  );
  const account = await Repo.getAccount(organizationId, draft.accountId);
  if (!conversation || !account) {
    throw new AppError("NOT_FOUND", "Conversation not found.");
  }
  const { token, pageId } = await sendableAccount(account);
  const sent = await sendSocialMessage({
    pageId,
    token,
    recipientId: conversation.participantId,
    text,
    fetcher: undefined,
  }).catch(providerFailure);
  await Repo.updateMessage(organizationId, draft.id, {
    externalMessageId: sent.externalMessageId,
    direction: "outbound",
    status: "sent",
    body: text,
    occurredAt: new Date().toISOString(),
  });
  await Repo.upsertConversation(account, {
    participantId: conversation.participantId,
    participantName: conversation.participantName,
    preview: text.slice(0, 160),
    lastMessageAt: new Date().toISOString(),
  });
  await audit(organizationId, userId, "social.draft.approved", draft.id);
  return { messageId: sent.externalMessageId };
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
  await audit(organizationId, userId, "social.draft.discarded", messageId);
  return { deleted: true };
}

async function setConversationStatus(
  organizationId: string,
  userId: string,
  input: z.infer<typeof setSocialConversationStatusSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    MODULE,
    "manage",
  );
  const row = await Repo.setConversationStatus(
    organizationId,
    input.conversationId,
    input.status,
  );
  if (!row) throw new AppError("NOT_FOUND", "Conversation not found.");
  return row;
}

export const SocialService = {
  workspace,
  thread,
  sendReply,
  approveDraft,
  discardDraft,
  setConversationStatus,
};

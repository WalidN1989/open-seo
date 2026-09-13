import { decryptCredentials } from "@/server/lib/connection-secrets";
import type { BridgeAccount, BridgeInboundMessage } from "@/shared/mail-bridge";
import { mailboxCredentialsFrom } from "../providers/mailbox";
import {
  bareAddress,
  normalizeMessageId,
  referencedMessageIds,
} from "../providers/threading";
import {
  EmailRepository as Repo,
  type EmailAccountRow,
} from "../repositories/EmailRepository";
import { replyWithAssistant } from "./EmailWebhookService";

const PROVIDER = "mailbox";

/** The mailboxes the bridge should watch, with what it needs to log in. */
async function accountsForBridge(): Promise<BridgeAccount[]> {
  const rows = await Repo.listConnectedByProvider(PROVIDER);
  const out: BridgeAccount[] = [];
  for (const row of rows) {
    const credentials = mailboxCredentialsFrom(
      await decryptCredentials(row.credentials),
    );
    if (!credentials) continue;
    out.push({
      accountId: row.id,
      address: row.address,
      credentials,
      syncCursor: row.syncCursor,
    });
  }
  return out;
}

/**
 * A reply lands on the thread of the message it answers. That message may be
 * one we sent (its id was recorded when it left) or one we received; either
 * way the mirror knows it. Anything else starts a thread of its own.
 */
async function threadKeyFor(
  account: EmailAccountRow,
  message: BridgeInboundMessage,
) {
  for (const id of referencedMessageIds(message)) {
    const known = await Repo.findMessageByExternalId(account.id, id);
    if (known) {
      const thread = await Repo.getThread(
        account.organizationId,
        known.threadId,
      );
      if (thread) return thread.externalThreadId;
    }
    if (await Repo.findThreadByExternalId(account.id, id)) return id;
  }
  return normalizeMessageId(message.messageId) ?? `uid:${message.uid}`;
}

async function ingestOne(
  account: EmailAccountRow,
  message: BridgeInboundMessage,
) {
  if (bareAddress(message.from) === account.address.toLowerCase()) return null;
  const externalMessageId =
    normalizeMessageId(message.messageId) ?? `uid:${message.uid}`;
  if (await Repo.findMessageByExternalId(account.id, externalMessageId)) {
    return null;
  }
  const threadKey = await threadKeyFor(account, message);
  const existingThread = await Repo.findThreadByExternalId(
    account.id,
    threadKey,
  );
  const threadRow = await Repo.upsertThread(account, {
    externalThreadId: threadKey,
    subject: existingThread?.subject ?? message.subject,
    preview: message.text?.slice(0, 160) ?? null,
    senders: [message.from],
    recipients: message.to,
    messageCount: null,
    lastMessageAt: message.date,
  });
  const inbound = await Repo.insertMessage({
    organizationId: account.organizationId,
    accountId: account.id,
    threadId: threadRow.id,
    externalMessageId,
    direction: "inbound",
    fromAddress: message.from,
    toAddresses: message.to,
    subject: message.subject,
    textBody: message.text,
    htmlBody: message.html?.slice(0, 200_000) ?? null,
    status: "received",
    authoredBy: null,
    occurredAt: message.date,
  });
  return { threadRow, inbound };
}

/**
 * New mail from the bridge. Every message is mirrored before the assistant
 * looks at it, and the cursor moves only after the batch is stored, so a
 * crash mid-way re-delivers rather than loses.
 */
async function ingest(accountId: string, messages: BridgeInboundMessage[]) {
  const account = await Repo.getAccountById(accountId);
  if (!account || account.status !== "connected") {
    return { accepted: 0, cursor: null };
  }
  let accepted = 0;
  let highest = Number(account.syncCursor ?? 0);
  for (const message of messages.toSorted((a, b) => a.uid - b.uid)) {
    const ingested = await ingestOne(account, message);
    highest = Math.max(highest, message.uid);
    if (!ingested) continue;
    accepted += 1;
    try {
      await replyWithAssistant(account, ingested.threadRow, ingested.inbound);
    } catch (error) {
      console.error("Email assistant failed; message kept for a person", error);
    }
  }
  const cursor = String(highest);
  await Repo.updateAccount(account.id, { syncCursor: cursor });
  return { accepted, cursor };
}

/** The bridge saw the mailbox for the first time and tells us where "now" is. */
async function setCursor(accountId: string, cursor: string) {
  const account = await Repo.getAccountById(accountId);
  if (!account) return;
  await Repo.updateAccount(account.id, { syncCursor: cursor });
}

export const MailboxIngestService = { accountsForBridge, ingest, setCursor };

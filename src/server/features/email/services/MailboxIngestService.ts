import { decryptCredentials } from "@/server/lib/connection-secrets";
import type {
  BridgeAccount,
  BridgeIngestRequest,
  BridgeInboundMessage,
  MailboxFolder,
} from "@/shared/mail-bridge";
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

/** {"inbox":"12","sent":"3"}; an older plain number was the inbox cursor. */
export function parseCursor(
  raw: string | null,
): Partial<Record<MailboxFolder, string>> {
  if (!raw) return {};
  if (/^\d+$/.test(raw)) return { inbox: raw };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Partial<Record<MailboxFolder, string>> = {};
    for (const folder of ["inbox", "sent"] as const) {
      if (!(folder in parsed)) continue;
      const value: unknown = Reflect.get(parsed, folder);
      if (typeof value === "string") out[folder] = value;
    }
    return out;
  } catch {
    return {};
  }
}

async function ingestOne(
  account: EmailAccountRow,
  folder: MailboxFolder,
  message: BridgeInboundMessage,
) {
  const own = account.address.toLowerCase();
  const fromSelf = bareAddress(message.from) === own;
  // Something we sent shows up in the inbox only when we mailed ourselves;
  // the Sent folder is where our own messages belong.
  if (folder === "inbox" && fromSelf) return null;
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
  const outbound = folder === "sent";
  // The list names the other party: whoever wrote to us, or whoever we
  // wrote to when the thread is ours.
  const others = outbound
    ? message.to.filter((to) => bareAddress(to) !== own)
    : [message.from];
  const threadRow = await Repo.upsertThread(account, {
    externalThreadId: threadKey,
    subject: existingThread?.subject ?? message.subject,
    preview: message.text?.slice(0, 160) ?? null,
    senders: others.length ? others : [message.from],
    recipients: outbound ? [account.address] : message.to,
    messageCount: null,
    lastMessageAt: message.date,
    lastDirection: outbound ? "outbound" : "inbound",
  });
  const inbound = await Repo.insertMessage({
    organizationId: account.organizationId,
    accountId: account.id,
    threadId: threadRow.id,
    externalMessageId,
    direction: outbound ? "outbound" : "inbound",
    fromAddress: message.from,
    toAddresses: message.to,
    subject: message.subject,
    textBody: message.text,
    htmlBody: message.html?.slice(0, 200_000) ?? null,
    status: outbound ? "sent" : "received",
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
async function ingest(input: BridgeIngestRequest) {
  const account = await Repo.getAccountById(input.accountId);
  if (!account || account.status !== "connected") {
    return { accepted: 0, cursor: null };
  }
  const cursors = parseCursor(account.syncCursor);
  let accepted = 0;
  let highest = Number(cursors[input.folder] ?? 0);
  for (const message of input.messages.toSorted((a, b) => a.uid - b.uid)) {
    const ingested = await ingestOne(account, input.folder, message);
    highest = Math.max(highest, message.uid);
    if (!ingested) continue;
    accepted += 1;
    // History is for reading. A draft reply to a three-week-old newsletter
    // would be noise, and answering it would be worse.
    if (input.backfill || input.folder !== "inbox") continue;
    try {
      await replyWithAssistant(account, ingested.threadRow, ingested.inbound);
    } catch (error) {
      console.error("Email assistant failed; message kept for a person", error);
    }
  }
  const cursor = String(highest);
  await Repo.updateAccount(account.id, {
    syncCursor: JSON.stringify({ ...cursors, [input.folder]: cursor }),
  });
  return { accepted, cursor };
}

/** Where a folder is up to, once the bridge has caught up its history. */
async function setCursor(
  accountId: string,
  folder: MailboxFolder,
  cursor: string,
) {
  const account = await Repo.getAccountById(accountId);
  if (!account) return;
  await Repo.updateAccount(account.id, {
    syncCursor: JSON.stringify({
      ...parseCursor(account.syncCursor),
      [folder]: cursor,
    }),
  });
}

export const MailboxIngestService = { accountsForBridge, ingest, setCursor };

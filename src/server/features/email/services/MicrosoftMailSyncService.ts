import { z } from "zod";
import { graphRequest } from "../providers/microsoft";
import {
  EmailRepository as Repo,
  type EmailAccountRow,
} from "../repositories/EmailRepository";

const address = z.object({ address: z.string() });
const recipient = z.object({ emailAddress: address });
const messageSchema = z.object({
  id: z.string(),
  conversationId: z.string().optional(),
  subject: z.string().nullable().optional(),
  bodyPreview: z.string().nullable().optional(),
  body: z
    .object({ contentType: z.string(), content: z.string() })
    .nullable()
    .optional(),
  from: recipient.nullable().optional(),
  toRecipients: z.array(recipient).optional(),
  ccRecipients: z.array(recipient).optional(),
  receivedDateTime: z.string().optional(),
  "@removed": z.unknown().optional(),
});
const pageSchema = z.object({
  value: z.array(messageSchema),
  "@odata.nextLink": z.string().optional(),
  "@odata.deltaLink": z.string().optional(),
});
const cursorSchema = z.object({ url: z.url(), cutoff: z.iso.datetime() });

/** No historical import: start when this mailbox is connected. */
export function initialMicrosoftMailCursor(connectedAt = new Date()) {
  const url = new URL(
    "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta",
  );
  url.searchParams.set(
    "$select",
    "id,conversationId,subject,bodyPreview,body,from,toRecipients,ccRecipients,receivedDateTime",
  );
  url.searchParams.set(
    "$filter",
    `receivedDateTime ge ${connectedAt.toISOString()}`,
  );
  url.searchParams.set("$top", "50");
  return JSON.stringify({
    url: url.toString(),
    cutoff: connectedAt.toISOString(),
  });
}

async function ingest(
  account: EmailAccountRow,
  message: z.infer<typeof messageSchema>,
  cutoff: string,
) {
  if (
    message["@removed"] ||
    !message.from?.emailAddress.address ||
    !message.receivedDateTime
  )
    return;
  if (message.receivedDateTime < cutoff) return;
  if (
    message.from.emailAddress.address.toLowerCase() ===
    account.address.toLowerCase()
  )
    return;
  if (await Repo.findMessageByExternalId(account.id, message.id)) return;
  const threadKey = message.conversationId ?? message.id;
  const existing = await Repo.findThreadByExternalId(account.id, threadKey);
  const latest =
    !existing || message.receivedDateTime >= existing.lastMessageAt;
  const from = message.from.emailAddress.address;
  const to = (message.toRecipients ?? []).map(
    (item) => item.emailAddress.address,
  );
  const thread = await Repo.upsertThread(account, {
    externalThreadId: threadKey,
    subject: existing?.subject ?? message.subject ?? null,
    preview: latest
      ? (message.bodyPreview ?? null)
      : (existing?.preview ?? null),
    senders: [from],
    recipients: to,
    messageCount: null,
    lastMessageAt: latest ? message.receivedDateTime : existing.lastMessageAt,
    lastDirection: latest
      ? "inbound"
      : existing?.lastDirection === "outbound"
        ? "outbound"
        : "inbound",
  });
  await Repo.insertMessage({
    organizationId: account.organizationId,
    accountId: account.id,
    threadId: thread.id,
    externalMessageId: message.id,
    direction: "inbound",
    fromAddress: from,
    toAddresses: to,
    ccAddresses: (message.ccRecipients ?? []).map(
      (item) => item.emailAddress.address,
    ),
    subject: message.subject ?? null,
    textBody: message.body?.content.slice(0, 200_000) ?? null,
    htmlBody: null,
    status: "received",
    authoredBy: null,
    occurredAt: message.receivedDateTime,
  });
  // This connector mirrors new mail only. It does not invoke an assistant or send replies.
}

async function syncAccount(account: EmailAccountRow) {
  if (!account.syncCursor)
    throw new Error("Microsoft mailbox has no start cursor; reconnect it.");
  const cursor = cursorSchema.parse(JSON.parse(account.syncCursor));
  for (let page = 0; page < 5; page += 1) {
    const response = await graphRequest(account, cursor.url);
    const batch = pageSchema.parse(await response.json());
    for (const message of batch.value.toSorted((a, b) =>
      (a.receivedDateTime ?? "").localeCompare(b.receivedDateTime ?? ""),
    )) {
      await ingest(account, message, cursor.cutoff);
    }
    const next = batch["@odata.nextLink"] ?? batch["@odata.deltaLink"];
    if (!next) throw new Error("Microsoft Graph did not return a mail cursor.");
    cursor.url = next;
    await Repo.updateAccount(account.id, {
      syncCursor: JSON.stringify(cursor),
      lastError: null,
    });
    if (batch["@odata.deltaLink"]) break;
  }
}

export async function syncMicrosoftMailboxes() {
  for (const account of await Repo.listConnectedByProvider("microsoft")) {
    try {
      await syncAccount(account);
    } catch (error) {
      console.error("Microsoft mail sync failed", account.id, error);
      await Repo.updateAccount(account.id, {
        lastError: "Microsoft mail sync failed. Check the connection.",
      });
    }
  }
}

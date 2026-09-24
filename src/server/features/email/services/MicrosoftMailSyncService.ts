import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
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
  sentDateTime: z.string().optional(),
  "@removed": z.unknown().optional(),
});
const pageSchema = z.object({
  value: z.array(messageSchema),
  "@odata.nextLink": z.string().optional(),
  "@odata.deltaLink": z.string().optional(),
});
const cursorSchema = z.object({
  url: z.url(),
  cutoff: z.iso.datetime(),
  historyUrl: z.url().optional(),
  historyFolder: z.enum(["inbox", "sentitems"]).optional(),
  historyDone: z.boolean().optional(),
});

function historyUrl(folder: "inbox" | "sentitems") {
  const url = new URL(
    `https://graph.microsoft.com/v1.0/me/mailFolders/${folder}/messages/delta`,
  );
  url.searchParams.set(
    "$select",
    "id,conversationId,subject,bodyPreview,body,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime",
  );
  url.searchParams.set("$top", "50");
  return url.toString();
}

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
  folder: "inbox" | "sentitems" = "inbox",
) {
  const occurredAt =
    folder === "sentitems"
      ? (message.sentDateTime ?? message.receivedDateTime)
      : message.receivedDateTime;
  if (message["@removed"] || !message.from?.emailAddress.address || !occurredAt)
    return;
  if (occurredAt < cutoff) return;
  if (
    folder === "inbox" &&
    message.from.emailAddress.address.toLowerCase() ===
      account.address.toLowerCase()
  )
    return;
  if (await Repo.findMessageByExternalId(account.id, message.id)) return;
  const threadKey = message.conversationId ?? message.id;
  const existing = await Repo.findThreadByExternalId(account.id, threadKey);
  const latest = !existing || occurredAt >= existing.lastMessageAt;
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
    lastMessageAt: latest ? occurredAt : existing.lastMessageAt,
    lastDirection: latest
      ? folder === "sentitems"
        ? "outbound"
        : "inbound"
      : existing?.lastDirection === "outbound"
        ? "outbound"
        : "inbound",
  });
  await Repo.insertMessage({
    organizationId: account.organizationId,
    accountId: account.id,
    threadId: thread.id,
    externalMessageId: message.id,
    direction: folder === "sentitems" ? "outbound" : "inbound",
    fromAddress: from,
    toAddresses: to,
    ccAddresses: (message.ccRecipients ?? []).map(
      (item) => item.emailAddress.address,
    ),
    subject: message.subject ?? null,
    textBody: message.body?.content.slice(0, 200_000) ?? null,
    htmlBody: null,
    status: folder === "sentitems" ? "sent" : "received",
    authoredBy: null,
    occurredAt,
  });
  // Mirroring never invokes an assistant or sends replies.
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
  if (!cursor.historyUrl || !cursor.historyFolder)
    return { historyComplete: true };
  for (let page = 0; page < 5; page += 1) {
    const response = await graphRequest(account, cursor.historyUrl);
    const batch = pageSchema.parse(await response.json());
    for (const message of batch.value.toSorted((a, b) =>
      (a.sentDateTime ?? a.receivedDateTime ?? "").localeCompare(
        b.sentDateTime ?? b.receivedDateTime ?? "",
      ),
    )) {
      await ingest(
        account,
        message,
        new Date(0).toISOString(),
        cursor.historyFolder,
      );
    }
    const next = batch["@odata.nextLink"] ?? batch["@odata.deltaLink"];
    if (!next)
      throw new Error("Microsoft Graph did not return a history cursor.");
    if (batch["@odata.deltaLink"]) {
      if (cursor.historyFolder === "inbox") {
        cursor.historyFolder = "sentitems";
        cursor.historyUrl = historyUrl("sentitems");
      } else {
        delete cursor.historyFolder;
        delete cursor.historyUrl;
        cursor.historyDone = true;
      }
    } else {
      cursor.historyUrl = next;
    }
    await Repo.updateAccount(account.id, {
      syncCursor: JSON.stringify(cursor),
      lastError: null,
    });
    if (!cursor.historyUrl) break;
  }
  return { historyComplete: !cursor.historyUrl };
}

/** Explicitly requested per-business import; a page-bounded pass can be resumed. */
export async function importExistingMicrosoftMail(
  organizationId: string,
  userId: string,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "email",
    "manage",
  );
  const account = await Repo.getAccount(organizationId);
  if (
    !account ||
    account.provider !== "microsoft" ||
    account.status !== "connected" ||
    !account.syncCursor
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Connect a Microsoft mailbox first.",
    );
  }
  const cursor = cursorSchema.parse(JSON.parse(account.syncCursor));
  if (cursor.historyDone) return { historyComplete: true };
  if (!cursor.historyUrl) {
    cursor.historyFolder = "inbox";
    cursor.historyUrl = historyUrl("inbox");
    await Repo.updateAccount(account.id, {
      syncCursor: JSON.stringify(cursor),
    });
  }
  const fresh = await Repo.getAccountById(account.id);
  if (!fresh) throw new AppError("NOT_FOUND", "Mailbox not found.");
  return syncAccount(fresh);
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

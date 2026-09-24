import { z } from "zod";
import { authorizedByInternalSecret } from "@/server/lib/internal-secret";
import {
  MAIL_BRIDGE_ACCOUNTS_PATH,
  MAIL_BRIDGE_INGEST_PATH,
  MAIL_BRIDGE_INTERNAL_PREFIX,
} from "@/shared/mail-bridge";
import { MailboxIngestService } from "./services/MailboxIngestService";

const inboundSchema = z.object({
  uid: z.number().int().nonnegative(),
  messageId: z.string().nullable(),
  inReplyTo: z.string().nullable(),
  references: z.array(z.string()).max(200),
  from: z.string().min(1),
  to: z.array(z.string()).max(200),
  cc: z.array(z.string()).max(200).default([]),
  subject: z.string().nullable(),
  text: z.string().nullable(),
  html: z.string().nullable(),
  date: z.string().min(1),
  attachments: z
    .array(
      z.object({
        filename: z.string().max(300),
        contentType: z.string().max(120),
        size: z.number().int().nonnegative(),
        contentBase64: z.string().nullable(),
      }),
    )
    .max(20)
    .default([]),
});

const folderSchema = z.enum(["inbox", "sent"]);

const ingestSchema = z.object({
  accountId: z.string().min(1),
  folder: folderSchema,
  backfill: z.boolean(),
  messages: z.array(inboundSchema).max(500),
});

const cursorSchema = z.object({
  accountId: z.string().min(1),
  folder: folderSchema,
  cursor: z.string().min(1),
});

/**
 * The bridge's two calls into the worker. Same secret and constant-time
 * check as the cron ticker; without the secret nothing here answers.
 */
export async function handleMailBridgeRequest(
  request: Request,
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (!(await authorizedByInternalSecret(request))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const pathname = new URL(request.url).pathname;
  if (pathname === MAIL_BRIDGE_ACCOUNTS_PATH) {
    return Response.json({
      accounts: await MailboxIngestService.accountsForBridge(),
    });
  }
  if (pathname === MAIL_BRIDGE_INGEST_PATH) {
    const parsed = ingestSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return Response.json({ error: "unreadable batch" }, { status: 400 });
    }
    const result = await MailboxIngestService.ingest(parsed.data);
    return Response.json(result);
  }
  if (pathname === `${MAIL_BRIDGE_INTERNAL_PREFIX}cursor`) {
    const parsed = cursorSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return Response.json({ error: "unreadable cursor" }, { status: 400 });
    }
    await MailboxIngestService.setCursor(
      parsed.data.accountId,
      parsed.data.folder,
      parsed.data.cursor,
    );
    return Response.json({ ok: true });
  }
  return new Response("Not found", { status: 404 });
}

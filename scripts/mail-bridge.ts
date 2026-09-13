/**
 * The mailbox bridge: IMAP and SMTP for mailboxes a business already owns.
 *
 * The app's server runs in the Worker runtime, which cannot open a TCP
 * socket, so this small Node process runs beside it in the same container
 * (like the cron ticker) and does the socket work:
 *
 *   - It asks the server which mailboxes are connected, keeps one IMAP
 *     connection open per mailbox in IDLE, and hands every new message to
 *     the server the moment the host announces it. No polling, no timers
 *     against the database: a quiet inbox costs nothing.
 *   - It answers three requests from the server on a loopback-only port:
 *     /verify (log in over IMAP and SMTP), /send (SMTP, then a copy into the
 *     Sent folder), /reload (the list of mailboxes changed).
 *
 * Every call in either direction carries INTERNAL_CRON_SECRET. Nothing here
 * is reachable from outside the container.
 */
import { createServer, type IncomingMessage } from "node:http";
import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject } from "mailparser";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import {
  MAIL_BRIDGE_ACCOUNTS_PATH,
  MAIL_BRIDGE_DEFAULT_PORT,
  MAIL_BRIDGE_INGEST_PATH,
  MAIL_BRIDGE_INTERNAL_PREFIX,
  MAIL_BRIDGE_SECRET_HEADER,
  type BridgeAccount,
  type BridgeInboundMessage,
  type BridgeSendRequest,
  type MailboxCredentials,
} from "../src/shared/mail-bridge";

const secret = process.env.INTERNAL_CRON_SECRET;
if (!secret) {
  console.error(
    "[mail-bridge] INTERNAL_CRON_SECRET is not set — mailboxes will not be watched.",
  );
  process.exit(0);
}
const serverPort = process.env.PORT ?? "3001";
const serverUrl =
  process.env.INTERNAL_CRON_URL ?? `http://127.0.0.1:${serverPort}`;
const listenPort = Number(
  process.env.MAIL_BRIDGE_PORT ?? MAIL_BRIDGE_DEFAULT_PORT,
);
const RELOAD_EVERY_MS = 30 * 60 * 1000;

function log(message: string, ...rest: unknown[]) {
  console.log(`[mail-bridge] ${message}`, ...rest);
}

async function worker<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${serverUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [MAIL_BRIDGE_SECRET_HEADER]: secret!,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }
  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// IMAP
// ---------------------------------------------------------------------------

function imapClient(credentials: MailboxCredentials) {
  return new ImapFlow({
    host: credentials.imapHost,
    port: credentials.imapPort,
    secure: credentials.imapPort === 993,
    auth: { user: credentials.username, pass: credentials.password },
    logger: false,
    // A host that drops idle connections is handled by reconnecting; a
    // client that hangs forever waiting on one is not.
    socketTimeout: 5 * 60 * 1000,
  });
}

function addresses(value: AddressObject | AddressObject[] | undefined) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list.flatMap((entry) =>
    entry.value.map((one) =>
      one.name ? `${one.name} <${one.address ?? ""}>` : (one.address ?? ""),
    ),
  );
}

async function parseMessage(
  uid: number,
  source: Buffer,
): Promise<BridgeInboundMessage> {
  const parsed = await simpleParser(source, { skipImageLinks: true });
  const references = Array.isArray(parsed.references)
    ? parsed.references
    : parsed.references
      ? [parsed.references]
      : [];
  return {
    uid,
    messageId: parsed.messageId ?? null,
    inReplyTo: parsed.inReplyTo ?? null,
    references,
    from: addresses(parsed.from)[0] ?? "",
    to: addresses(parsed.to),
    subject: parsed.subject ?? null,
    text: parsed.text ?? null,
    html: typeof parsed.html === "string" ? parsed.html : null,
    date: (parsed.date ?? new Date()).toISOString(),
  };
}

/** One mailbox: connect, catch up, idle, hand over, reconnect. */
class Watcher {
  private client: ImapFlow | null = null;
  private stopped = false;
  private syncing = false;
  private again = false;
  private cursor: number | null;
  private backoffMs = 5_000;

  constructor(readonly account: BridgeAccount) {
    this.cursor =
      account.syncCursor === null ? null : Number(account.syncCursor);
  }

  get key() {
    return JSON.stringify([this.account.address, this.account.credentials]);
  }

  start() {
    void this.loop();
  }

  async stop() {
    this.stopped = true;
    try {
      await this.client?.logout();
    } catch {
      // Already gone.
    }
  }

  private async loop() {
    while (!this.stopped) {
      try {
        await this.session();
        this.backoffMs = 5_000;
      } catch (error) {
        log(
          `${this.account.address}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (this.stopped) return;
      await new Promise((resolve) => setTimeout(resolve, this.backoffMs));
      this.backoffMs = Math.min(this.backoffMs * 2, 5 * 60 * 1000);
    }
  }

  private async session() {
    const client = imapClient(this.account.credentials);
    this.client = client;
    await client.connect();
    const mailbox = await client.mailboxOpen("INBOX");
    if (this.cursor === null) {
      // First sight of this inbox: everything already there is history the
      // business has read elsewhere. Start from the next message.
      this.cursor = mailbox.uidNext - 1;
      await worker(`${MAIL_BRIDGE_INTERNAL_PREFIX}cursor`, {
        accountId: this.account.accountId,
        cursor: String(this.cursor),
      });
    }
    log(`${this.account.address}: watching from UID ${this.cursor + 1}`);
    client.on("exists", () => void this.catchUp());
    await this.catchUp();
    // imapflow idles by itself whenever no command is running; the promise
    // below settles only when the host or the network ends the session.
    await new Promise<void>((resolve, reject) => {
      client.once("close", () => resolve());
      client.once("error", (error: Error) => reject(error));
    });
    this.client = null;
  }

  private async catchUp() {
    if (this.syncing) {
      this.again = true;
      return;
    }
    this.syncing = true;
    try {
      do {
        this.again = false;
        await this.fetchNew();
      } while (this.again && !this.stopped);
    } catch (error) {
      log(
        `${this.account.address}: fetch failed, ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.syncing = false;
    }
  }

  private async fetchNew() {
    const client = this.client;
    if (!client || this.cursor === null) return;
    const from = this.cursor + 1;
    const batch: BridgeInboundMessage[] = [];
    // "n:*" also returns the highest message when n is past the end; the
    // cursor check drops that repeat.
    for await (const message of client.fetch(
      `${from}:*`,
      { uid: true, source: true },
      { uid: true },
    )) {
      if (message.uid <= this.cursor || !message.source) continue;
      batch.push(await parseMessage(message.uid, message.source));
    }
    if (batch.length === 0) return;
    const result = await worker<{ accepted: number; cursor: string | null }>(
      MAIL_BRIDGE_INGEST_PATH,
      { accountId: this.account.accountId, messages: batch },
    );
    this.cursor = Math.max(this.cursor, ...batch.map((m) => m.uid));
    log(
      `${this.account.address}: ${batch.length} new, ${result.accepted} kept`,
    );
  }
}

const watchers = new Map<string, Watcher>();

async function reload() {
  let accounts: BridgeAccount[];
  try {
    ({ accounts } = await worker<{ accounts: BridgeAccount[] }>(
      MAIL_BRIDGE_ACCOUNTS_PATH,
      {},
    ));
  } catch (error) {
    log(
      `could not list mailboxes: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }
  const wanted = new Map(
    accounts.map((account) => [account.accountId, account]),
  );
  for (const [id, watcher] of watchers) {
    const next = wanted.get(id);
    if (!next || new Watcher(next).key !== watcher.key) {
      watchers.delete(id);
      void watcher.stop();
    }
  }
  for (const account of accounts) {
    if (watchers.has(account.accountId)) continue;
    const watcher = new Watcher(account);
    watchers.set(account.accountId, watcher);
    watcher.start();
  }
  log(`${watchers.size} mailbox(es) watched`);
}

// ---------------------------------------------------------------------------
// SMTP
// ---------------------------------------------------------------------------

function smtpTransport(credentials: MailboxCredentials) {
  const secure = credentials.smtpPort === 465;
  return nodemailer.createTransport({
    host: credentials.smtpHost,
    port: credentials.smtpPort,
    secure,
    requireTLS: !secure,
    auth: { user: credentials.username, pass: credentials.password },
    connectionTimeout: 20_000,
    socketTimeout: 60_000,
  });
}

/** imapflow and nodemailer both say "Command failed"; say what to check. */
function describe(step: "IMAP" | "SMTP", error: unknown): Error {
  const detail =
    error && typeof error === "object"
      ? (error as { responseText?: string; authenticationFailed?: boolean })
      : {};
  if (detail.authenticationFailed) {
    return new Error(
      `${step} refused the login. Check the address and the mailbox password.`,
    );
  }
  const text =
    detail.responseText ??
    (error instanceof Error ? error.message : String(error));
  return new Error(`${step}: ${text}`);
}

async function verify(credentials: MailboxCredentials) {
  const client = imapClient(credentials);
  try {
    await client.connect();
    await client.mailboxOpen("INBOX", { readOnly: true });
  } catch (error) {
    throw describe("IMAP", error);
  } finally {
    await client.logout().catch(() => undefined);
  }
  try {
    await smtpTransport(credentials).verify();
  } catch (error) {
    throw describe("SMTP", error);
  }
}

/** Best effort: a copy in Sent so the mailbox's own clients show it too. */
async function appendToSent(credentials: MailboxCredentials, raw: Buffer) {
  const client = imapClient(credentials);
  try {
    await client.connect();
    const boxes = await client.list();
    const sent =
      boxes.find((box) => box.specialUse === "\\Sent")?.path ??
      boxes.find((box) => /^sent/i.test(box.name))?.path ??
      "Sent";
    await client.append(sent, raw, ["\\Seen"]);
  } catch (error) {
    log(
      `could not copy to Sent: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    await client.logout().catch(() => undefined);
  }
}

async function send(request: BridgeSendRequest) {
  const composer = new MailComposer({
    from: request.from.name
      ? { name: request.from.name, address: request.from.address }
      : request.from.address,
    to: request.to,
    subject: request.subject,
    text: request.text,
    html: request.html,
    inReplyTo: request.inReplyTo ? `<${request.inReplyTo}>` : undefined,
    references: request.references?.map((id) => `<${id}>`).join(" "),
  });
  const message = composer.compile();
  const messageId = message.messageId();
  const raw = await message.build();
  await smtpTransport(request.credentials).sendMail({
    envelope: { from: request.from.address, to: request.to },
    raw,
  });
  await appendToSent(request.credentials, raw);
  return { messageId: messageId.replace(/^<|>$/g, "") };
}

// ---------------------------------------------------------------------------
// The loopback HTTP server the worker talks to
// ---------------------------------------------------------------------------

function authorized(request: IncomingMessage) {
  const provided = request.headers[MAIL_BRIDGE_SECRET_HEADER];
  if (typeof provided !== "string" || provided.length !== secret!.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < secret!.length; i += 1) {
    mismatch |= secret!.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return mismatch === 0;
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

const server = createServer(async (request, response) => {
  const reply = (status: number, body: unknown) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  };
  if (request.method !== "POST") return reply(405, { error: "POST only" });
  if (!authorized(request)) return reply(401, { error: "unauthorized" });
  try {
    const body = (await readJson(request)) as Record<string, unknown>;
    switch (request.url) {
      case "/verify":
        await verify(body.credentials as MailboxCredentials);
        return reply(200, { ok: true });
      case "/send":
        return reply(200, await send(body as unknown as BridgeSendRequest));
      case "/reload":
        await reload();
        return reply(200, { ok: true });
      default:
        return reply(404, { error: "not found" });
    }
  } catch (error) {
    return reply(502, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(listenPort, "127.0.0.1", () => {
  log(`listening on 127.0.0.1:${listenPort}`);
});

// Wait for the server to answer before the first reload, then keep the list
// fresh on a slow timer; connects and disconnects poke /reload immediately.
async function waitForServer() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`${serverUrl}/api/health`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (response.ok) return;
    } catch {
      // Still booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
}

void waitForServer().then(async () => {
  await reload();
  setInterval(() => void reload(), RELOAD_EVERY_MS);
});

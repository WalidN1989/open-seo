/**
 * The contract between the worker and the mailbox bridge.
 *
 * workerd cannot open a TCP socket, so IMAP and SMTP for a customer's own
 * mailbox (Namecheap, any ordinary host) run in a small Node process beside
 * the server in the same container — the same arrangement as the cron
 * ticker. The bridge asks the worker which mailboxes to watch, hands new
 * mail back, and sends on the worker's behalf. Both directions carry the
 * cron secret; nothing here is reachable from outside the container.
 */
export const MAIL_BRIDGE_INTERNAL_PREFIX = "/api/internal/mailbox/";
export const MAIL_BRIDGE_ACCOUNTS_PATH = `${MAIL_BRIDGE_INTERNAL_PREFIX}accounts`;
export const MAIL_BRIDGE_INGEST_PATH = `${MAIL_BRIDGE_INTERNAL_PREFIX}ingest`;
export const MAIL_BRIDGE_DEFAULT_PORT = 3002;
export const MAIL_BRIDGE_SECRET_HEADER = "x-internal-cron-secret";

export type MailboxCredentials = {
  username: string;
  password: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
};

/**
 * How mail leaves. "smtp" is the mailbox's own server. "resend" is for hosts
 * that block outbound SMTP ports (Railway does): the message goes through
 * Resend's HTTPS API from the same address, on a domain Resend has verified,
 * with a copy placed in the mailbox's Sent folder over IMAP.
 */
export type MailboxTransport = "smtp" | "resend";

export type BridgeVerifyResult = {
  ok: true;
  /** null when SMTP worked; otherwise why it did not. */
  smtpProblem: string | null;
};

/** The two folders the bridge mirrors. */
export type MailboxFolder = "inbox" | "sent";

/** One mailbox the bridge should keep IMAP connections open for. */
export type BridgeAccount = {
  accountId: string;
  address: string;
  credentials: MailboxCredentials;
  /**
   * Last IMAP UID handed over, per folder, as JSON ({"inbox":"12","sent":"3"}).
   * A missing folder means "never seen": recent history is imported first.
   */
  syncCursor: string | null;
};

export type BridgeIngestRequest = {
  accountId: string;
  folder: MailboxFolder;
  /** History imported on first sight: mirrored, but never answered. */
  backfill: boolean;
  messages: BridgeInboundMessage[];
};

/** How far back the first import reaches, and at most how many messages. */
export const BACKFILL_DAYS = 90;
export const BACKFILL_MAX = 300;

/** A message the bridge read from the inbox, already parsed. */
export type BridgeInboundMessage = {
  uid: number;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  from: string;
  to: string[];
  cc: string[];
  subject: string | null;
  text: string | null;
  html: string | null;
  date: string;
};

/** A file sent with a message, base64 so it survives the JSON hop. */
export type MailAttachment = {
  filename: string;
  contentType: string;
  contentBase64: string;
};

export type BridgeSendRequest = {
  credentials: MailboxCredentials;
  transport: MailboxTransport;
  /** Needed when transport is "resend". */
  resendApiKey?: string;
  from: { address: string; name?: string };
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
  html?: string;
  inReplyTo?: string;
  references?: string[];
  attachments?: MailAttachment[];
};

export type BridgeSendResult = { messageId: string };

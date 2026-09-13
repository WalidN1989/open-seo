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

/** One mailbox the bridge should keep an IMAP connection open for. */
export type BridgeAccount = {
  accountId: string;
  address: string;
  credentials: MailboxCredentials;
  /** Last IMAP UID already handed over; null means "start from now". */
  syncCursor: string | null;
};

/** A message the bridge read from the inbox, already parsed. */
export type BridgeInboundMessage = {
  uid: number;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  from: string;
  to: string[];
  subject: string | null;
  text: string | null;
  html: string | null;
  date: string;
};

export type BridgeSendRequest = {
  credentials: MailboxCredentials;
  from: { address: string; name?: string };
  to: string[];
  subject: string;
  text: string;
  html?: string;
  inReplyTo?: string;
  references?: string[];
};

export type BridgeSendResult = { messageId: string };

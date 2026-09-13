import { AppError } from "@/server/lib/errors";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import {
  MAIL_BRIDGE_DEFAULT_PORT,
  MAIL_BRIDGE_SECRET_HEADER,
  type BridgeSendRequest,
  type BridgeSendResult,
  type BridgeVerifyResult,
  type MailboxCredentials,
  type MailboxTransport,
} from "@/shared/mail-bridge";

/**
 * The worker's side of the mailbox bridge: verify a login, send a message,
 * or tell the bridge its list of mailboxes changed. Reading happens the
 * other way round — the bridge pushes new mail to the worker.
 */

/** Stored credentials are a flat string record; this is the typed view. */
export function mailboxCredentialsFrom(
  creds: Record<string, string | undefined>,
): MailboxCredentials | null {
  const imapPort = Number(creds.IMAP_PORT);
  const smtpPort = Number(creds.SMTP_PORT);
  if (
    !creds.USERNAME ||
    !creds.PASSWORD ||
    !creds.IMAP_HOST ||
    !creds.SMTP_HOST ||
    !Number.isInteger(imapPort) ||
    !Number.isInteger(smtpPort)
  ) {
    return null;
  }
  return {
    username: creds.USERNAME,
    password: creds.PASSWORD,
    imapHost: creds.IMAP_HOST,
    imapPort,
    smtpHost: creds.SMTP_HOST,
    smtpPort,
  };
}

/** Stored beside the login: how this mailbox sends. Defaults to SMTP. */
export function mailboxTransportFrom(
  creds: Record<string, string | undefined>,
): MailboxTransport {
  return creds.SEND_VIA === "resend" ? "resend" : "smtp";
}

export function mailboxCredentialsToStored(
  creds: MailboxCredentials,
  transport: MailboxTransport,
): Record<string, string> {
  return {
    SEND_VIA: transport,
    USERNAME: creds.username,
    PASSWORD: creds.password,
    IMAP_HOST: creds.imapHost,
    IMAP_PORT: String(creds.imapPort),
    SMTP_HOST: creds.smtpHost,
    SMTP_PORT: String(creds.smtpPort),
  };
}

async function bridgeUrl() {
  const configured = await getOptionalEnvValue("MAIL_BRIDGE_URL");
  return (configured ?? `http://127.0.0.1:${MAIL_BRIDGE_DEFAULT_PORT}`).replace(
    /\/+$/,
    "",
  );
}

function bridgeError(payload: unknown, status: number) {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }
  return `bridge returned ${status}`;
}

async function bridgeRequest<T>(
  path: string,
  body: unknown,
  parse: (payload: unknown) => T,
): Promise<T> {
  const secret = await getOptionalEnvValue("INTERNAL_CRON_SECRET");
  if (!secret) {
    throw new AppError(
      "VALIDATION_ERROR",
      "The mailbox bridge needs INTERNAL_CRON_SECRET set on the server.",
    );
  }
  let response: Response;
  try {
    response = await fetch(`${await bridgeUrl()}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [MAIL_BRIDGE_SECRET_HEADER]: secret,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    });
  } catch (error) {
    throw new AppError(
      "INTEGRATION_CHECK_FAILED",
      `The mailbox bridge is not running beside the server (${error instanceof Error ? error.message : "unreachable"}).`,
    );
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new AppError(
      "INTEGRATION_CHECK_FAILED",
      bridgeError(payload, response.status),
    );
  }
  return parse(payload);
}

/**
 * Log in over IMAP once, so a typo fails now and not on first send. SMTP is
 * tried too; a host that blocks it is reported rather than fatal, because
 * the caller may have another way out.
 */
export async function verifyMailbox(credentials: MailboxCredentials) {
  return bridgeRequest(
    "/verify",
    { credentials },
    (payload): BridgeVerifyResult => ({
      ok: true,
      smtpProblem:
        payload &&
        typeof payload === "object" &&
        "smtpProblem" in payload &&
        typeof payload.smtpProblem === "string"
          ? payload.smtpProblem
          : null,
    }),
  );
}

export async function sendViaMailbox(
  request: BridgeSendRequest,
): Promise<BridgeSendResult> {
  return bridgeRequest("/send", request, (payload): BridgeSendResult => {
    if (
      payload &&
      typeof payload === "object" &&
      "messageId" in payload &&
      typeof payload.messageId === "string"
    ) {
      return { messageId: payload.messageId };
    }
    throw new AppError(
      "INTEGRATION_CHECK_FAILED",
      "The bridge sent, but returned no message id.",
    );
  });
}

/**
 * The bridge re-reads its account list on its own timer; a poke makes a
 * just-connected mailbox start receiving now. Best effort: if the bridge is
 * down the account is still saved and picked up when it comes back.
 */
export async function pokeBridgeReload() {
  try {
    await bridgeRequest("/reload", {}, () => ({ ok: true }));
  } catch {
    // The next timed reload picks it up.
  }
}

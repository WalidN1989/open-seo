import { env } from "cloudflare:workers";

/**
 * Transactional email through Resend.
 *
 * Loops needs a template to be authored in its dashboard and referenced by id,
 * which makes password reset impossible to switch on from environment
 * variables alone. Resend takes the HTML in the request, so a deployment only
 * needs a key and a verified sender to get its auth emails working.
 */

const RESEND_SEND_URL = "https://api.resend.com/emails";

type ResendConfig = { apiKey: string; from: string };

function getOptionalEnv(name: string) {
  const value: unknown = Reflect.get(env, name);
  const trimmed = typeof value === "string" ? value.trim() : "";

  return trimmed || null;
}

/**
 * The sender is not defaulted. Resend rejects any address on a domain the
 * account has not verified, and a guessed default would fail at send time —
 * long after the operator could connect the error to what they configured.
 */
export function getResendConfig(): ResendConfig | null {
  const apiKey = getOptionalEnv("RESEND_API_KEY");
  if (!apiKey) return null;

  const from = getOptionalEnv("RESEND_FROM_EMAIL");
  if (!from) {
    throw new Error(
      "RESEND_FROM_EMAIL is required when RESEND_API_KEY is set. Use an address on a domain verified in Resend, for example: OpenSEO <no-reply@example.com>",
    );
  }

  return { apiKey, from };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * A single-column table layout with inline styles: Gmail strips <style> blocks
 * and Outlook ignores flexbox, so anything more modern renders as unstyled
 * text in the clients most people read mail in.
 */
function renderActionEmail({
  heading,
  body,
  buttonLabel,
  actionUrl,
  footer,
}: {
  heading: string;
  body: string;
  buttonLabel: string;
  actionUrl: string;
  footer: string;
}) {
  const safeUrl = escapeHtml(actionUrl);

  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f4f5f7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:36px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1c2530;">
<tr><td style="font-size:20px;font-weight:600;padding-bottom:14px;">${escapeHtml(heading)}</td></tr>
<tr><td style="font-size:15px;line-height:1.6;color:#42505e;padding-bottom:26px;">${escapeHtml(body)}</td></tr>
<tr><td style="padding-bottom:26px;">
<a href="${safeUrl}" style="display:inline-block;background:#1c2530;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 26px;border-radius:8px;">${escapeHtml(buttonLabel)}</a>
</td></tr>
<tr><td style="font-size:13px;line-height:1.6;color:#6b7885;padding-bottom:10px;">If the button does not work, paste this link into your browser:</td></tr>
<tr><td style="font-size:12px;line-height:1.5;padding-bottom:26px;"><a href="${safeUrl}" style="color:#0c6a6a;word-break:break-all;">${safeUrl}</a></td></tr>
<tr><td style="font-size:12px;line-height:1.6;color:#8a95a1;border-top:1px solid #e6e9ed;padding-top:18px;">${escapeHtml(footer)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/**
 * Every message ships a text/plain part too. A HTML-only transactional mail is
 * a well-known spam signal, and the reset link is the one thing that must
 * survive a client that refuses to render HTML at all.
 */
async function sendResendEmail({
  config,
  to,
  subject,
  html,
  text,
  fetcher = fetch,
}: {
  config: ResendConfig;
  to: string;
  subject: string;
  html: string;
  text: string;
  fetcher?: typeof fetch;
}) {
  const response = await fetcher(RESEND_SEND_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({ from: config.from, to: [to], subject, html, text }),
    signal: AbortSignal.timeout(20_000),
  });

  if (response.ok) return;

  // The recipient address is logged because an operator debugging a missing
  // email needs to know which send failed. The body is not: Resend echoes
  // request detail back in its errors.
  const detail = await response.text().catch(() => "");
  console.error("Resend transactional email error:", {
    status: response.status,
    to,
    subject,
  });

  throw new Error(
    `Failed to send email through Resend (${response.status}): ${detail.slice(0, 200)}`,
  );
}

export async function sendResendPasswordResetEmail(
  config: ResendConfig,
  {
    email,
    resetUrl,
    appName,
    fetcher,
  }: {
    email: string;
    resetUrl: string;
    appName: string;
    fetcher?: typeof fetch;
  },
) {
  await sendResendEmail({
    config,
    to: email,
    subject: `Reset your ${appName} password`,
    html: renderActionEmail({
      heading: "Reset your password",
      body: `Someone asked to reset the password for your ${appName} account. Choose a new one using the link below. It expires in one hour.`,
      buttonLabel: "Choose a new password",
      actionUrl: resetUrl,
      footer:
        "If you did not request this, you can ignore this email — your password will not change.",
    }),
    text: `Reset your ${appName} password\n\nSomeone asked to reset the password for your ${appName} account. Open the link below to choose a new one. It expires in one hour.\n\n${resetUrl}\n\nIf you did not request this, you can ignore this email — your password will not change.\n`,
    fetcher,
  });
}

export async function sendResendVerificationEmail(
  config: ResendConfig,
  {
    email,
    confirmationUrl,
    appName,
    fetcher,
  }: {
    email: string;
    confirmationUrl: string;
    appName: string;
    fetcher?: typeof fetch;
  },
) {
  await sendResendEmail({
    config,
    to: email,
    subject: `Confirm your ${appName} email address`,
    html: renderActionEmail({
      heading: "Confirm your email address",
      body: `Confirm this address to finish setting up your ${appName} account.`,
      buttonLabel: "Confirm email address",
      actionUrl: confirmationUrl,
      footer: "If you did not create this account, you can ignore this email.",
    }),
    text: `Confirm your ${appName} email address\n\nConfirm this address to finish setting up your ${appName} account.\n\n${confirmationUrl}\n\nIf you did not create this account, you can ignore this email.\n`,
    fetcher,
  });
}

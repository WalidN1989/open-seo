import { env } from "cloudflare:workers";
import {
  sendHostedPasswordResetEmail,
  sendHostedVerificationEmail,
} from "@/server/email/loops";
import {
  getResendConfig,
  sendResendPasswordResetEmail,
  sendResendVerificationEmail,
} from "@/server/email/resend";

/**
 * Chooses which provider sends the account emails.
 *
 * Loops came first and needs three variables including two template ids
 * authored in its dashboard, so a deployment that had not set them up got a
 * password reset page that could never work. Resend needs a key and a verified
 * sender, which an operator can finish in one sitting, so it takes precedence
 * wherever it is configured.
 */

const APP_NAME = "Digital Urgency";

type EmailProvider = "resend" | "loops";

function getConfiguredEmailProvider(): EmailProvider | null {
  // getResendConfig throws on a half-configured Resend rather than silently
  // falling through to Loops: a key with no sender is a mistake to report, not
  // a reason to use a different provider than the operator intended.
  if (getResendConfig()) return "resend";

  const loopsKey: unknown = Reflect.get(env, "LOOPS_API_KEY");
  if (typeof loopsKey === "string" && loopsKey.trim()) return "loops";

  return null;
}

function noProviderError() {
  return new Error(
    "No transactional email provider is configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL, or the LOOPS_API_KEY and LOOPS_TRANSACTIONAL_* variables.",
  );
}

export async function sendPasswordResetEmail({
  email,
  resetUrl,
}: {
  email: string;
  resetUrl: string;
}) {
  const resend = getResendConfig();
  if (resend) {
    await sendResendPasswordResetEmail(resend, {
      email,
      resetUrl,
      appName: APP_NAME,
    });
    return;
  }

  if (getConfiguredEmailProvider() !== "loops") throw noProviderError();
  await sendHostedPasswordResetEmail({ email, resetUrl });
}

export async function sendAccountVerificationEmail({
  email,
  confirmationUrl,
}: {
  email: string;
  confirmationUrl: string;
}) {
  const resend = getResendConfig();
  if (resend) {
    await sendResendVerificationEmail(resend, {
      email,
      confirmationUrl,
      appName: APP_NAME,
    });
    return;
  }

  if (getConfiguredEmailProvider() !== "loops") throw noProviderError();
  await sendHostedVerificationEmail({ email, confirmationUrl });
}

import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import { decryptCredentials } from "@/server/lib/connection-secrets";
import type { EmailAccountRow } from "./repositories/EmailRepository";

export const mailboxPreferencesSchema = z.object({
  signature: z.string().trim().max(2000).default(""),
  manualOnly: z.boolean().default(false),
  pollEveryFiveMinutes: z.boolean().default(false),
});

export function preferencesFrom(values: Record<string, string | undefined>) {
  if (!values.MAILBOX_PREFERENCES) return mailboxPreferencesSchema.parse({});
  try {
    return mailboxPreferencesSchema.parse(
      JSON.parse(values.MAILBOX_PREFERENCES),
    );
  } catch {
    // A damaged policy must never silently re-enable automatic sending.
    throw new AppError("VALIDATION_ERROR", "Mailbox preferences need repair.");
  }
}

export async function mailboxPreferences(account: EmailAccountRow) {
  return preferencesFrom(
    account.provider === "mailbox"
      ? await decryptCredentials(account.credentials)
      : {},
  );
}

export async function signedEmailText(account: EmailAccountRow, text: string) {
  const { signature } = await mailboxPreferences(account);
  const body = text.trimEnd();
  return !signature || body.endsWith(signature)
    ? body
    : `${body}\n\n${signature}`;
}

export async function requireMcpSendConfirmation(
  account: EmailAccountRow | null,
  confirmed: boolean | undefined,
) {
  if (
    account &&
    (await mailboxPreferences(account)).manualOnly &&
    confirmed !== true
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Save a draft first. Show the user the recipients, subject and exact body, then pass confirmed: true only after their explicit approval.",
    );
  }
}

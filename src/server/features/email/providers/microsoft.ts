import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import {
  decryptCredentials,
  encryptCredentials,
} from "@/server/lib/connection-secrets";
import { getRequiredEnvValue } from "@/server/lib/runtime-env";
import {
  EmailRepository as Repo,
  type EmailAccountRow,
} from "../repositories/EmailRepository";

const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
});

export async function microsoftConfig() {
  const [tenantId, clientId, clientSecret] = await Promise.all([
    getRequiredEnvValue("MICROSOFT_MAIL_TENANT_ID"),
    getRequiredEnvValue("MICROSOFT_MAIL_CLIENT_ID"),
    getRequiredEnvValue("MICROSOFT_MAIL_CLIENT_SECRET"),
  ]);
  return { tenantId, clientId, clientSecret };
}

export const MICROSOFT_MAIL_SCOPES =
  "openid profile email offline_access User.Read Mail.Read Mail.Send";

export async function exchangeMicrosoftToken(body: URLSearchParams) {
  const config = await microsoftConfig();
  body.set("client_id", config.clientId);
  body.set("client_secret", config.clientSecret);
  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );
  if (!response.ok) {
    throw new AppError(
      "INTEGRATION_CHECK_FAILED",
      "Microsoft sign-in failed. Check the app registration and try again.",
    );
  }
  return tokenSchema.parse(await response.json());
}

/** Refresh on each operation so the browser never sees a mail token. */
export async function microsoftAccessToken(account: EmailAccountRow) {
  const stored = await decryptCredentials(account.credentials);
  if (!stored.REFRESH_TOKEN) {
    throw new AppError(
      "INTEGRATION_CHECK_FAILED",
      "Microsoft mailbox needs to be reconnected.",
    );
  }
  const tokens = await exchangeMicrosoftToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: stored.REFRESH_TOKEN,
      scope: MICROSOFT_MAIL_SCOPES,
    }),
  );
  if (tokens.refresh_token && tokens.refresh_token !== stored.REFRESH_TOKEN) {
    await Repo.updateAccount(account.id, {
      credentials: await encryptCredentials({
        REFRESH_TOKEN: tokens.refresh_token,
      }),
    });
  }
  return tokens.access_token;
}

export async function graphRequest(
  account: EmailAccountRow,
  path: string,
  init: RequestInit = {},
) {
  const url = path.startsWith("https://graph.microsoft.com/v1.0/")
    ? path
    : `https://graph.microsoft.com/v1.0/${path.replace(/^\//, "")}`;
  if (!url.startsWith("https://graph.microsoft.com/v1.0/")) {
    throw new AppError("VALIDATION_ERROR", "Invalid Microsoft Graph URL.");
  }
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${await microsoftAccessToken(account)}`);
  headers.set(
    "Prefer",
    'IdType="ImmutableId", outlook.body-content-type="text"',
  );
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(url, { ...init, headers });
  if (!response.ok) {
    throw new AppError(
      "INTEGRATION_CHECK_FAILED",
      `Microsoft mail request failed (${response.status}).`,
    );
  }
  return response;
}

import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import { responseForAppError } from "@/server/lib/http-errors";
import { getRequiredEnvValue } from "@/server/lib/runtime-env";
import { signToken, verifyToken } from "@/server/lib/signed-token";
import { encryptCredentials } from "@/server/lib/connection-secrets";
import { getPublicOrigin } from "@/server/mcp/public-origin";
import { resolveUserContextFromHeaders } from "@/middleware/ensure-user/resolve";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { EmailRepository as Repo } from "../repositories/EmailRepository";
import { audit } from "./EmailAccountService";
import { initialMicrosoftMailCursor } from "./MicrosoftMailSyncService";
import {
  MICROSOFT_MAIL_SCOPES,
  exchangeMicrosoftToken,
  microsoftConfig,
} from "../providers/microsoft";

const CALLBACK = "/api/email/microsoft/callback";
const stateSchema = z.object({
  organizationId: z.string().min(1),
  userId: z.string().min(1),
  address: z.email(),
  displayName: z.string().min(1),
  origin: z.url(),
  expiresAt: z.number(),
});

export async function microsoftAuthorizationUrl(input: {
  organizationId: string;
  userId: string;
  address: string;
  displayName: string;
  origin: string;
}) {
  const configuredOrigin = new URL(await getRequiredEnvValue("BETTER_AUTH_URL"))
    .origin;
  if (input.origin !== configuredOrigin) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Microsoft sign-in must start from the configured application URL.",
    );
  }
  await BusinessModuleService.requireAccess(
    input.organizationId,
    input.userId,
    "email",
    "admin",
  );
  const existing = await Repo.getAccount(input.organizationId);
  if (existing?.status === "connected") {
    throw new AppError(
      "CONFLICT",
      "This business already has an email account. Disconnect it first.",
    );
  }
  const config = await microsoftConfig();
  const state = await signToken(
    { ...input, expiresAt: Date.now() + 10 * 60_000 },
    await getRequiredEnvValue("BETTER_AUTH_SECRET"),
  );
  const url = new URL(
    `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/authorize`,
  );
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", `${input.origin}${CALLBACK}`);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", MICROSOFT_MAIL_SCOPES);
  url.searchParams.set("login_hint", input.address);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function handleMicrosoftEmailCallback(request: Request) {
  try {
    const context = await resolveUserContextFromHeaders(request.headers);
    const url = new URL(request.url);
    if (url.searchParams.has("error")) {
      throw new AppError(
        "INTEGRATION_CHECK_FAILED",
        "Microsoft sign-in was declined or failed.",
      );
    }
    const state = await verifyToken(
      url.searchParams.get("state") ?? "",
      await getRequiredEnvValue("BETTER_AUTH_SECRET"),
      (value): value is z.infer<typeof stateSchema> =>
        stateSchema.safeParse(value).success,
    );
    if (
      !state ||
      state.expiresAt < Date.now() ||
      state.userId !== context.userId ||
      state.organizationId !== context.organizationId ||
      state.origin !== getPublicOrigin(request)
    ) {
      throw new AppError(
        "VALIDATION_ERROR",
        "This Microsoft sign-in has expired or does not match your session.",
      );
    }
    if (
      state.origin !==
      new URL(await getRequiredEnvValue("BETTER_AUTH_URL")).origin
    ) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Microsoft sign-in returned to the wrong application URL.",
      );
    }
    await BusinessModuleService.requireAccess(
      context.organizationId,
      context.userId,
      "email",
      "admin",
    );
    const code = url.searchParams.get("code");
    if (!code)
      throw new AppError(
        "VALIDATION_ERROR",
        "Missing Microsoft authorization code.",
      );
    const tokens = await exchangeMicrosoftToken(
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${state.origin}${CALLBACK}`,
        scope: MICROSOFT_MAIL_SCOPES,
      }),
    );
    if (!tokens.refresh_token) {
      throw new AppError(
        "INTEGRATION_CHECK_FAILED",
        "Microsoft did not grant offline mailbox access. Try signing in again.",
      );
    }
    const meResponse = await fetch(
      "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName",
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      },
    );
    if (!meResponse.ok)
      throw new AppError(
        "INTEGRATION_CHECK_FAILED",
        "Could not verify the signed-in Microsoft mailbox.",
      );
    const me = z
      .object({
        mail: z.string().nullable().optional(),
        userPrincipalName: z.string(),
      })
      .parse(await meResponse.json());
    const actual = (me.mail || me.userPrincipalName).toLowerCase();
    if (actual !== state.address.toLowerCase()) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Signed in as ${actual}, but this connection expects ${state.address}.`,
      );
    }
    const existing = await Repo.getAccount(state.organizationId);
    if (existing?.status === "connected")
      throw new AppError(
        "CONFLICT",
        "This business already has a connected email account.",
      );
    const values = {
      address: actual,
      displayName: state.displayName,
      provider: "microsoft",
      podId: null,
      inboxId: null,
    };
    const account = existing
      ? await Repo.updateAccount(existing.id, values)
      : await Repo.createAccount({
          organizationId: state.organizationId,
          ...values,
        });
    if (!account)
      throw new AppError("NOT_FOUND", "Email account was not created.");
    await Repo.updateAccount(account.id, {
      credentials: await encryptCredentials({
        REFRESH_TOKEN: tokens.refresh_token,
      }),
      status: "connected",
      syncCursor: initialMicrosoftMailCursor(),
      webhookId: null,
      lastError: null,
      autopilot: false,
    });
    await audit(
      state.organizationId,
      state.userId,
      "email.account.connected",
      account.id,
      {
        provider: "microsoft",
        address: actual,
      },
    );
    return Response.redirect(`${state.origin}/modules/email`, 303);
  } catch (error) {
    return responseForAppError(error, "Microsoft mailbox connection failed.");
  }
}

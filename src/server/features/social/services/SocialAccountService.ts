import type { z } from "zod";
import { AppError } from "@/server/lib/errors";
import {
  encryptCredentials,
  mergeCredentials,
} from "@/server/lib/connection-secrets";
import { BusinessAuditRepository } from "@/server/features/business-modules/repositories/BusinessAuditRepository";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { isUniqueViolation } from "@/server/lib/db-errors";
import type {
  connectSocialAccountSchema,
  updateSocialAccountSchema,
} from "@/types/schemas/social";
import {
  SocialRepository as Repo,
  type SocialAccountRow,
} from "../repositories/SocialRepository";

const MODULE = "social" as const;

/** The account as the browser may see it: everything but the secrets. */
export function publicAccount(account: SocialAccountRow | null) {
  if (!account) return null;
  const { credentials, ...rest } = account;
  return { ...rest, hasCredentials: Boolean(credentials) };
}

async function audit(
  organizationId: string,
  userId: string,
  action: string,
  targetId: string,
  metadata?: Record<string, unknown>,
) {
  await BusinessAuditRepository.record({
    organizationId,
    actorUserId: userId,
    action,
    targetType: "social_account",
    targetId,
    metadata,
  });
}

function secretsFrom(input: {
  accessToken?: string;
  appSecret?: string;
  verifyToken?: string;
}) {
  const secrets: Record<string, string> = {};
  if (input.accessToken) secrets.PAGE_ACCESS_TOKEN = input.accessToken;
  if (input.appSecret) secrets.APP_SECRET = input.appSecret;
  if (input.verifyToken) secrets.VERIFY_TOKEN = input.verifyToken;
  return secrets;
}

/**
 * Connect one Instagram account or Facebook Page.
 *
 * In Meta's development mode these credentials belong to an app the operator
 * administers, so they reach their own account without App Review. The same
 * shape works later for a reviewed app; only where the token comes from
 * changes.
 */
async function connect(
  organizationId: string,
  userId: string,
  input: z.infer<typeof connectSocialAccountSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    MODULE,
    "admin",
  );
  if (!input.accessToken) {
    throw new AppError(
      "VALIDATION_ERROR",
      "A Page access token is needed, or the account saves and then cannot send.",
    );
  }
  if (!input.appSecret) {
    throw new AppError(
      "VALIDATION_ERROR",
      "The app secret is needed to check that a delivery really came from Meta.",
    );
  }
  const account = await Repo.createAccount({
    organizationId,
    platform: input.platform,
    displayName: input.displayName,
    externalAccountId: input.externalAccountId,
    pageId: input.pageId,
    credentials: await encryptCredentials(secretsFrom(input)),
    status: "connected",
  }).catch((error: unknown) => {
    if (!isUniqueViolation(error)) throw error;
    throw new AppError(
      "CONFLICT",
      "That account is already connected. Open it and use Update instead.",
    );
  });
  await audit(organizationId, userId, "social.account.connected", account.id, {
    platform: input.platform,
  });
  return publicAccount(account);
}

async function update(
  organizationId: string,
  userId: string,
  input: z.infer<typeof updateSocialAccountSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    MODULE,
    "admin",
  );
  const current = await Repo.getAccount(organizationId, input.accountId);
  if (!current) throw new AppError("NOT_FOUND", "Account not found.");
  const { accountId, accessToken, appSecret, verifyToken, ...rest } = input;
  // A blank field means "keep what is stored"; the browser never receives a
  // secret, so an untouched box arrives empty and must not wipe one.
  const changes = Object.fromEntries(
    Object.entries(rest).filter(
      ([, value]) => value !== undefined && value !== "",
    ),
  );
  const updated = await Repo.updateAccount(accountId, {
    ...changes,
    credentials: await mergeCredentials(
      current.credentials,
      secretsFrom({ accessToken, appSecret, verifyToken }),
    ),
    lastError: null,
  });
  await audit(organizationId, userId, "social.account.updated", accountId);
  return publicAccount(updated);
}

async function disconnect(
  organizationId: string,
  userId: string,
  accountId: string,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    MODULE,
    "admin",
  );
  const account = await Repo.getAccount(organizationId, accountId);
  if (!account) throw new AppError("NOT_FOUND", "Account not found.");
  // The conversations stay; only the ability to send and receive stops.
  const updated = await Repo.updateAccount(accountId, {
    status: "disconnected",
    credentials: null,
  });
  await audit(organizationId, userId, "social.account.disconnected", accountId);
  return publicAccount(updated);
}

async function setAutopilot(
  organizationId: string,
  userId: string,
  accountId: string,
  autopilot: boolean,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    MODULE,
    "manage",
  );
  const account = await Repo.getAccount(organizationId, accountId);
  if (!account) throw new AppError("NOT_FOUND", "Account not found.");
  const updated = await Repo.updateAccount(accountId, { autopilot });
  await audit(organizationId, userId, "social.autopilot.changed", accountId, {
    autopilot,
  });
  return publicAccount(updated);
}

export const SocialAccountService = {
  connect,
  update,
  disconnect,
  setAutopilot,
};

import type { z } from "zod";
import { AppError } from "@/server/lib/errors";
import { AuthRepository } from "@/server/auth/repositories/AuthRepository";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { ClientAccountRepository as Repo } from "../repositories/ClientAccountRepository";
import {
  codeHint,
  formatAccessCode,
  generateAccessCode,
  generateSalt,
  hashAccessCode,
} from "../accessCode";
import type {
  createClientAccountSchema,
  setClientAccountStatusSchema,
} from "@/types/schemas/clients";

const MODULE = "clients" as const;

async function requireManage(organizationId: string, userId: string) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    MODULE,
    "manage",
  );
}

async function workspace(organizationId: string, userId: string) {
  await BusinessModuleService.requireAccess(organizationId, userId, MODULE);
  const [accounts, events] = await Promise.all([
    Repo.listAccounts(organizationId),
    Repo.listEvents(organizationId),
  ]);
  const contacts = await Promise.all(
    accounts.map((account) => Repo.listContacts(organizationId, account.id)),
  );
  return {
    accounts: accounts.map((account, index) => ({
      ...account,
      contacts: (contacts[index] ?? []).map((contact) => ({
        id: contact.id,
        channel: contact.channel,
        identifier: contact.identifier,
        displayName: contact.displayName,
        verifiedAt: contact.verifiedAt,
        lastSeenAt: contact.lastSeenAt,
      })),
    })),
    events: events.map((event) => ({
      id: event.id,
      clientAccountId: event.clientAccountId,
      identifier: event.identifier,
      kind: event.kind,
      detail: event.detail,
      createdAt: event.createdAt,
    })),
  };
}

/**
 * The workspaces this user could link a client account to.
 *
 * Only organizations they are actually a member of: the register records
 * relationships that already exist rather than reaching into a workspace
 * nobody here belongs to.
 */
async function linkableOrganizations(organizationId: string, userId: string) {
  await BusinessModuleService.requireAccess(organizationId, userId, MODULE);
  const [ids, existing] = await Promise.all([
    AuthRepository.listOrganizationIdsForUser(userId),
    Repo.listAccounts(organizationId),
  ]);
  const taken = new Set(existing.map((row) => row.clientOrganizationId));
  return ids.filter((id) => id !== organizationId && !taken.has(id));
}

/**
 * Issue a code and return it once.
 *
 * The plaintext is returned here and nowhere else, because it is stored
 * derived and salted. Losing it costs one rotation, which is a cheaper problem
 * than a readable secret sitting in a table.
 */
async function issueCode(organizationId: string, accountId: string) {
  const code = generateAccessCode();
  const salt = generateSalt();
  await Repo.updateAccount(organizationId, accountId, {
    codeHash: await hashAccessCode(code, salt),
    codeSalt: salt,
    codeHint: codeHint(code),
    codeIssuedAt: new Date().toISOString(),
  });
  return formatAccessCode(code);
}

async function create(
  organizationId: string,
  userId: string,
  input: z.infer<typeof createClientAccountSchema>,
) {
  await requireManage(organizationId, userId);
  if (input.clientOrganizationId === organizationId) {
    throw new AppError(
      "VALIDATION_ERROR",
      "A workspace cannot be its own client.",
    );
  }
  const memberships = await AuthRepository.listOrganizationIdsForUser(userId);
  if (!memberships.includes(input.clientOrganizationId)) {
    throw new AppError("FORBIDDEN");
  }

  let accountId: string;
  try {
    const account = await Repo.insertAccount({
      id: crypto.randomUUID(),
      organizationId,
      clientOrganizationId: input.clientOrganizationId,
      displayName: input.displayName,
      status: "active",
    });
    accountId = account.id;
  } catch {
    // The unique index on (organization, client organization) is the guard;
    // this turns it into a sentence rather than a 500.
    throw new AppError(
      "CONFLICT",
      "That workspace is already registered as a client.",
    );
  }

  const code = await issueCode(organizationId, accountId);
  await Repo.recordEvent({
    id: crypto.randomUUID(),
    organizationId,
    clientAccountId: accountId,
    channel: "whatsapp",
    identifier: "—",
    kind: "rotated",
    detail: "First code issued.",
  });
  return { accountId, code };
}

/** Rotate. Numbers already verified stay verified. */
async function rotateCode(
  organizationId: string,
  userId: string,
  accountId: string,
) {
  await requireManage(organizationId, userId);
  const account = await Repo.getAccount(organizationId, accountId);
  if (!account) throw new AppError("NOT_FOUND", "Client account not found.");
  const code = await issueCode(organizationId, accountId);
  await Repo.recordEvent({
    id: crypto.randomUUID(),
    organizationId,
    clientAccountId: accountId,
    channel: "whatsapp",
    identifier: "—",
    kind: "rotated",
    detail: "Code rotated.",
  });
  return { code };
}

async function setStatus(
  organizationId: string,
  userId: string,
  input: z.infer<typeof setClientAccountStatusSchema>,
) {
  await requireManage(organizationId, userId);
  const row = await Repo.updateAccount(organizationId, input.clientAccountId, {
    status: input.status,
  });
  if (!row) throw new AppError("NOT_FOUND", "Client account not found.");
  return { status: row.status };
}

/**
 * Take a number's access away.
 *
 * The row stays so the access log still reads correctly; it simply stops
 * granting anything, and that number must verify again with a current code.
 */
async function revokeContact(
  organizationId: string,
  userId: string,
  contactId: string,
) {
  await requireManage(organizationId, userId);
  const row = await Repo.revokeContact(organizationId, contactId);
  if (!row) throw new AppError("NOT_FOUND", "Contact not found.");
  await Repo.recordEvent({
    id: crypto.randomUUID(),
    organizationId,
    clientAccountId: row.clientAccountId,
    channel: row.channel,
    identifier: row.identifier,
    kind: "revoked",
    detail: "Access removed by staff.",
  });
  return { revoked: true };
}

async function remove(
  organizationId: string,
  userId: string,
  accountId: string,
) {
  await requireManage(organizationId, userId);
  const account = await Repo.getAccount(organizationId, accountId);
  if (!account) throw new AppError("NOT_FOUND", "Client account not found.");
  await Repo.deleteAccount(organizationId, accountId);
  return { deleted: true };
}

export const ClientAccountService = {
  workspace,
  linkableOrganizations,
  create,
  rotateCode,
  setStatus,
  revokeContact,
  remove,
};

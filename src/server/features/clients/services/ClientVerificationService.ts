import { and, count, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  clientAccounts,
  clientContacts,
  clientAccessEvents,
} from "@/db/schema";
import { ClientAccountRepository as Repo } from "../repositories/ClientAccountRepository";
import {
  codesMatch,
  hashAccessCode,
  LOCKOUT_MS,
  MAX_ATTEMPTS,
} from "../accessCode";
import { findAccessCodeCandidate } from "../codeInMessage";

/**
 * The gate.
 *
 * Everything here decides in code, not in a prompt. A model can be talked
 * round; a function that returns "anonymous" until a row says otherwise
 * cannot. Nothing in this file consults the assistant, and the assistant
 * cannot call into it.
 */

export type ClientAccess =
  /** This workspace does not provide private SEO-client verification. */
  | { kind: "unavailable" }
  /** A number the register has never seen prove itself. */
  | { kind: "anonymous" }
  /** Already verified on a previous message. */
  | {
      kind: "verified";
      accountId: string;
      displayName: string;
      clientOrganizationId: string;
    }
  /** This message carried a correct code; the number is now bound. */
  | {
      kind: "just_verified";
      accountId: string;
      displayName: string;
      clientOrganizationId: string;
    }
  /** This message carried a code that did not match. */
  | { kind: "rejected"; remaining: number }
  /** Too many wrong codes recently. */
  | { kind: "locked" };

async function findVerifiedContact(organizationId: string, identifier: string) {
  const [row] = await db
    .select({
      accountId: clientAccounts.id,
      displayName: clientAccounts.displayName,
      clientOrganizationId: clientAccounts.clientOrganizationId,
      status: clientAccounts.status,
      contactId: clientContacts.id,
      organizationId: clientAccounts.organizationId,
    })
    .from(clientContacts)
    .innerJoin(
      clientAccounts,
      and(
        eq(clientAccounts.id, clientContacts.clientAccountId),
        eq(clientAccounts.organizationId, organizationId),
      ),
    )
    .where(
      and(
        eq(clientContacts.organizationId, organizationId),
        eq(clientContacts.identifier, identifier),
        eq(clientContacts.channel, "whatsapp"),
        isNull(clientContacts.revokedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function recentFailures(
  organizationId: string,
  identifier: string,
  since: string,
) {
  const [row] = await db
    .select({ failures: count() })
    .from(clientAccessEvents)
    .where(
      and(
        eq(clientAccessEvents.organizationId, organizationId),
        eq(clientAccessEvents.channel, "whatsapp"),
        eq(clientAccessEvents.identifier, identifier),
        eq(clientAccessEvents.kind, "rejected"),
        gt(clientAccessEvents.createdAt, since),
      ),
    );
  return row?.failures ?? 0;
}

/**
 * Which account, if any, a code belongs to.
 *
 * Every active account in the agency's register is tried, because a client
 * sends a code without saying who they are. Comparison is constant time and
 * the loop does not stop early on a near miss.
 */
async function matchCode(organizationId: string, code: string) {
  const accounts = await db
    .select()
    .from(clientAccounts)
    .where(
      and(
        eq(clientAccounts.organizationId, organizationId),
        eq(clientAccounts.status, "active"),
      ),
    );
  let found: (typeof accounts)[number] | null = null;
  for (const account of accounts) {
    if (!account.codeHash || !account.codeSalt) continue;
    const candidate = await hashAccessCode(code, account.codeSalt);
    if (codesMatch(candidate, account.codeHash)) found = account;
  }
  return found;
}

/**
 * Work out what an inbound message means for account access.
 *
 * Called before the assistant runs, so a message carrying a code never reaches
 * the model at all.
 */
export async function resolveClientAccess(input: {
  organizationId: string;
  identifier: string;
  body: string;
}): Promise<ClientAccess> {
  if (!(await Repo.verificationEnabled(input.organizationId))) {
    return { kind: "unavailable" };
  }
  const existing = await findVerifiedContact(
    input.organizationId,
    input.identifier,
  );
  if (existing) {
    if (existing.status !== "active") return { kind: "anonymous" };
    await db
      .update(clientContacts)
      .set({ lastSeenAt: new Date().toISOString() })
      .where(
        and(
          eq(clientContacts.organizationId, input.organizationId),
          eq(clientContacts.id, existing.contactId),
        ),
      );
    return {
      kind: "verified",
      accountId: existing.accountId,
      displayName: existing.displayName,
      clientOrganizationId: existing.clientOrganizationId,
    };
  }

  const candidate = findAccessCodeCandidate(input.body);
  if (!candidate) return { kind: "anonymous" };
  const { code } = candidate;

  // Only an explicit /verify submission reaches hashing or the lockout.
  const since = new Date(Date.now() - LOCKOUT_MS).toISOString();
  if (
    (await recentFailures(input.organizationId, input.identifier, since)) >=
    MAX_ATTEMPTS
  ) {
    await Repo.recordEvent({
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
      clientAccountId: null,
      channel: "whatsapp",
      identifier: input.identifier,
      kind: "locked",
      detail: "Too many wrong codes.",
    });
    return { kind: "locked" };
  }

  const account = await matchCode(input.organizationId, code);
  if (!account) {
    await Repo.recordEvent({
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
      clientAccountId: null,
      channel: "whatsapp",
      identifier: input.identifier,
      kind: "rejected",
      detail: "Code did not match any client.",
    });
    const failures = await recentFailures(
      input.organizationId,
      input.identifier,
      since,
    );
    return {
      kind: "rejected",
      remaining: Math.max(0, MAX_ATTEMPTS - failures),
    };
  }

  const verifiedAt = new Date().toISOString();
  await db
    .insert(clientContacts)
    .values({
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
      clientAccountId: account.id,
      channel: "whatsapp",
      identifier: input.identifier,
      verifiedAt,
      lastSeenAt: verifiedAt,
    })
    .onConflictDoUpdate({
      target: [
        clientContacts.organizationId,
        clientContacts.channel,
        clientContacts.identifier,
      ],
      set: {
        clientAccountId: account.id,
        verifiedAt,
        lastSeenAt: verifiedAt,
        revokedAt: null,
      },
    });
  await Repo.recordEvent({
    id: crypto.randomUUID(),
    organizationId: input.organizationId,
    clientAccountId: account.id,
    channel: "whatsapp",
    identifier: input.identifier,
    kind: "verified",
    detail: `Verified as ${account.displayName}.`,
  });
  return {
    kind: "just_verified",
    accountId: account.id,
    displayName: account.displayName,
    clientOrganizationId: account.clientOrganizationId,
  };
}

export const ClientVerificationService = { resolveClientAccess };

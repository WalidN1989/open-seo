import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  clientAccessEvents,
  clientAccounts,
  clientContacts,
  organization,
} from "@/db/schema";

export type ClientAccountRow = typeof clientAccounts.$inferSelect;
export type ClientContactRow = typeof clientContacts.$inferSelect;

function now() {
  return new Date().toISOString();
}

/** Accounts with the client workspace's own name, for the register list. */
async function listAccounts(organizationId: string) {
  return db
    .select({
      id: clientAccounts.id,
      clientOrganizationId: clientAccounts.clientOrganizationId,
      clientOrganizationName: organization.name,
      displayName: clientAccounts.displayName,
      status: clientAccounts.status,
      codeHint: clientAccounts.codeHint,
      codeIssuedAt: clientAccounts.codeIssuedAt,
      createdAt: clientAccounts.createdAt,
    })
    .from(clientAccounts)
    .leftJoin(
      organization,
      eq(organization.id, clientAccounts.clientOrganizationId),
    )
    .where(eq(clientAccounts.organizationId, organizationId))
    .orderBy(clientAccounts.displayName);
}

async function getAccount(organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(clientAccounts)
    .where(
      and(
        eq(clientAccounts.organizationId, organizationId),
        eq(clientAccounts.id, id),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function insertAccount(values: typeof clientAccounts.$inferInsert) {
  const [row] = await db.insert(clientAccounts).values(values).returning();
  return row!;
}

async function updateAccount(
  organizationId: string,
  id: string,
  patch: Partial<typeof clientAccounts.$inferInsert>,
) {
  const [row] = await db
    .update(clientAccounts)
    .set({ ...patch, updatedAt: now() })
    .where(
      and(
        eq(clientAccounts.organizationId, organizationId),
        eq(clientAccounts.id, id),
      ),
    )
    .returning();
  return row ?? null;
}

async function deleteAccount(organizationId: string, id: string) {
  await db
    .delete(clientAccounts)
    .where(
      and(
        eq(clientAccounts.organizationId, organizationId),
        eq(clientAccounts.id, id),
      ),
    );
}

/** Live contacts only; a revoked one stays for the log but grants nothing. */
async function listContacts(organizationId: string, accountId: string) {
  return db
    .select()
    .from(clientContacts)
    .where(
      and(
        eq(clientContacts.organizationId, organizationId),
        eq(clientContacts.clientAccountId, accountId),
        isNull(clientContacts.revokedAt),
      ),
    )
    .orderBy(desc(clientContacts.verifiedAt));
}

async function revokeContact(organizationId: string, contactId: string) {
  const [row] = await db
    .update(clientContacts)
    .set({ revokedAt: now() })
    .where(
      and(
        eq(clientContacts.organizationId, organizationId),
        eq(clientContacts.id, contactId),
      ),
    )
    .returning();
  return row ?? null;
}

async function listEvents(organizationId: string, limit = 100) {
  return db
    .select()
    .from(clientAccessEvents)
    .where(eq(clientAccessEvents.organizationId, organizationId))
    .orderBy(desc(clientAccessEvents.createdAt))
    .limit(limit);
}

/**
 * The timestamp is written here rather than left to the column default.
 *
 * The two dialects disagree: SQLite's `current_timestamp` writes
 * "2026-09-09 22:45:25" and Postgres writes an ISO string. They sort
 * differently against each other, and the lockout compares this column with
 * an ISO string — so on SQLite every failed attempt sorted below the window
 * and the five-attempt lockout never fired at all.
 */
async function recordEvent(values: typeof clientAccessEvents.$inferInsert) {
  const [row] = await db
    .insert(clientAccessEvents)
    .values({ createdAt: now(), ...values })
    .returning();
  return row!;
}

export const ClientAccountRepository = {
  listAccounts,
  getAccount,
  insertAccount,
  updateAccount,
  deleteAccount,
  listContacts,
  revokeContact,
  listEvents,
  recordEvent,
};

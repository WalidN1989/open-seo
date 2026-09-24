import { and, desc, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  clientLogins,
  organization,
  projects,
  session,
  user,
} from "@/db/schema";

/**
 * Rows for the logins the agency created for people outside it.
 *
 * "Last seen" is read from the session table rather than written on every
 * request: a write per page view would keep the database awake for nothing,
 * and a session's own timestamps already say when someone was last here.
 */

export type ClientLoginRow = typeof clientLogins.$inferSelect;

async function create(input: {
  organizationId: string;
  userId: string;
  createdByUserId: string;
  demoData: boolean;
}) {
  const [row] = await db
    .insert(clientLogins)
    .values({ id: crypto.randomUUID(), ...input })
    .returning();
  return row ?? null;
}

async function find(organizationId: string, userId: string) {
  const [row] = await db
    .select()
    .from(clientLogins)
    .where(
      and(
        eq(clientLogins.organizationId, organizationId),
        eq(clientLogins.userId, userId),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function update(id: string, patch: Partial<ClientLoginRow>) {
  await db.update(clientLogins).set(patch).where(eq(clientLogins.id, id));
}

/** Every client login in a workspace, newest first, with who it belongs to. */
async function listForOrganization(organizationId: string) {
  return db
    .select({
      login: clientLogins,
      name: user.name,
      email: user.email,
    })
    .from(clientLogins)
    .innerJoin(user, eq(user.id, clientLogins.userId))
    .where(eq(clientLogins.organizationId, organizationId))
    .orderBy(desc(clientLogins.createdAt));
}

/**
 * Candidates for a nudge: anyone not yet through the run. The idle test needs
 * the last sign-in, so it happens in the service once these are in hand.
 */
async function listUnfinished(lastStage: number, limit = 200) {
  return db
    .select({
      login: clientLogins,
      email: user.email,
      name: user.name,
      workspace: organization.name,
    })
    .from(clientLogins)
    .innerJoin(user, eq(user.id, clientLogins.userId))
    .innerJoin(organization, eq(organization.id, clientLogins.organizationId))
    .where(lt(clientLogins.nudgeStage, lastStage))
    .limit(limit);
}

/** The most recent session activity for each of these users. */
async function lastSeen(userIds: string[]) {
  if (userIds.length === 0) return new Map<string, string>();
  const rows = await db
    .select({
      userId: session.userId,
      seenAt: sql<number>`max(${session.updatedAt})`,
    })
    .from(session)
    .where(inArray(session.userId, userIds))
    .groupBy(session.userId);
  return new Map(
    rows.flatMap(({ userId, seenAt }) => {
      const ms = Number(seenAt);
      return Number.isFinite(ms)
        ? [[userId, new Date(ms).toISOString()] as const]
        : [];
    }),
  );
}

/** The workspace's own website, which says what trade it is in. */
async function domainOf(organizationId: string) {
  const [row] = await db
    .select({ domain: projects.domain })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, organizationId),
        isNotNull(projects.domain),
      ),
    )
    .limit(1);
  return row?.domain ?? null;
}

export const ClientLoginRepository = {
  domainOf,
  create,
  find,
  update,
  listForOrganization,
  listUnfinished,
  lastSeen,
};

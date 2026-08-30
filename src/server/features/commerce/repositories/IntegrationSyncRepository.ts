import { and, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { integrationConnections } from "@/db/schema";

async function getConnection(organizationId: string, connectionId: string) {
  const [row] = await db
    .select()
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.id, connectionId),
        eq(integrationConnections.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function recordHealth(
  organizationId: string,
  connectionId: string,
  input: { status: "connected" | "error"; healthDetail: string },
) {
  const now = new Date().toISOString();
  const [row] = await db
    .update(integrationConnections)
    .set({
      status: input.status,
      healthDetail: input.healthDetail,
      lastCheckedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(integrationConnections.id, connectionId),
        eq(integrationConnections.organizationId, organizationId),
      ),
    )
    .returning();
  return row ?? null;
}

async function setSyncState(
  organizationId: string,
  connectionId: string,
  input: {
    syncStatus: "idle" | "queued" | "running" | "error";
    syncError: string | null;
    syncedCount?: number;
    lastSyncedAt?: string;
    syncCursor?: number;
  },
) {
  const [row] = await db
    .update(integrationConnections)
    .set({ ...input, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(integrationConnections.id, connectionId),
        eq(integrationConnections.organizationId, organizationId),
      ),
    )
    .returning();
  return row ?? null;
}

async function setSchedule(
  organizationId: string,
  connectionId: string,
  input: { autoSync: boolean; syncIntervalMinutes: number },
) {
  const [row] = await db
    .update(integrationConnections)
    .set({ ...input, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(integrationConnections.id, connectionId),
        eq(integrationConnections.organizationId, organizationId),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Connections the scheduler should sync: anything explicitly queued, plus any
 * auto-sync connection whose interval has elapsed.
 *
 * Deliberately not organization-scoped — the scheduler acts for no tenant, and
 * every other read in this file is scoped.
 */
/** A sync still "running" after this long is taken to have died. */
const STALE_RUN_MS = 15 * 60_000;

async function listDueSyncs(limit: number) {
  const now = Date.now();
  const rows = await db
    .select()
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.providerKey, "woocommerce"),
        eq(integrationConnections.status, "connected"),
        or(
          eq(integrationConnections.syncStatus, "queued"),
          eq(integrationConnections.syncStatus, "running"),
          eq(integrationConnections.autoSync, true),
        ),
      ),
    )
    .limit(limit * 4);

  return rows
    .filter((row) => {
      if (row.syncStatus === "queued") return true;
      // A run that died mid-flight leaves "running" behind and nothing else
      // ever clears it. Reclaim it once it is plainly not running any more,
      // or the catalogue silently stops syncing for good.
      if (row.syncStatus === "running") {
        const since = now - new Date(row.updatedAt).getTime();
        return since >= STALE_RUN_MS;
      }
      if (!row.autoSync) return false;
      if (!row.lastSyncedAt) return true;
      const elapsed = now - new Date(row.lastSyncedAt).getTime();
      return elapsed >= row.syncIntervalMinutes * 60_000;
    })
    .slice(0, limit);
}

export const IntegrationSyncRepository = {
  getConnection,
  recordHealth,
  setSyncState,
  setSchedule,
  listDueSyncs,
};

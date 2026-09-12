import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { projectSearchHistory } from "@/db/schema";

/** How much of a project's history any one module keeps. */
const MAX_PER_MODULE = 50;

async function list(projectId: string, module: string) {
  return db
    .select({
      itemKey: projectSearchHistory.itemKey,
      itemJson: projectSearchHistory.itemJson,
      ranByUserId: projectSearchHistory.ranByUserId,
      createdAt: projectSearchHistory.createdAt,
    })
    .from(projectSearchHistory)
    .where(
      and(
        eq(projectSearchHistory.projectId, projectId),
        eq(projectSearchHistory.module, module),
      ),
    )
    .orderBy(desc(projectSearchHistory.createdAt))
    .limit(MAX_PER_MODULE);
}

/**
 * Record one search, and keep the list from growing without bound.
 *
 * Re-running a search moves it to the top rather than adding a second row, so
 * the list stays a record of what has been looked at rather than how often.
 */
async function add(input: {
  projectId: string;
  module: string;
  itemKey: string;
  itemJson: string;
  ranByUserId: string | null;
}) {
  const createdAt = new Date().toISOString();
  await db
    .insert(projectSearchHistory)
    .values({ id: crypto.randomUUID(), ...input, createdAt })
    .onConflictDoUpdate({
      target: [
        projectSearchHistory.projectId,
        projectSearchHistory.module,
        projectSearchHistory.itemKey,
      ],
      set: {
        itemJson: sql`excluded.item_json`,
        ranByUserId: input.ranByUserId,
        createdAt,
      },
    });
  await trim(input.projectId, input.module);
}

/** Drop the oldest beyond the cap, so one busy project cannot grow for ever. */
async function trim(projectId: string, module: string) {
  const rows = await db
    .select({ id: projectSearchHistory.id })
    .from(projectSearchHistory)
    .where(
      and(
        eq(projectSearchHistory.projectId, projectId),
        eq(projectSearchHistory.module, module),
      ),
    )
    .orderBy(desc(projectSearchHistory.createdAt));
  const stale = rows.slice(MAX_PER_MODULE).map((row) => row.id);
  if (!stale.length) return;
  await db
    .delete(projectSearchHistory)
    .where(inArray(projectSearchHistory.id, stale));
}

async function remove(projectId: string, module: string, itemKey: string) {
  await db
    .delete(projectSearchHistory)
    .where(
      and(
        eq(projectSearchHistory.projectId, projectId),
        eq(projectSearchHistory.module, module),
        eq(projectSearchHistory.itemKey, itemKey),
      ),
    );
}

async function clear(projectId: string, module: string) {
  await db
    .delete(projectSearchHistory)
    .where(
      and(
        eq(projectSearchHistory.projectId, projectId),
        eq(projectSearchHistory.module, module),
      ),
    );
}

export const SearchHistoryRepository = { list, add, remove, clear };

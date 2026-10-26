import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { db } from "@/db";
import { customerActionRequests as actions } from "@/db/schema";
type Draft = typeof actions.$inferInsert;
async function get(organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(actions)
    .where(and(eq(actions.organizationId, organizationId), eq(actions.id, id)))
    .limit(1);
  return row ?? null;
}
async function create(input: Draft) {
  const [row] = await db.insert(actions).values(input).returning();
  return row;
}
async function list(organizationId: string) {
  return db
    .select()
    .from(actions)
    .where(eq(actions.organizationId, organizationId))
    .orderBy(desc(actions.createdAt))
    .limit(100);
}
async function transition(
  organizationId: string,
  id: string,
  from: string[],
  patch: Partial<Draft>,
) {
  const [row] = await db
    .update(actions)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(actions.organizationId, organizationId),
        eq(actions.id, id),
        inArray(actions.status, from),
        gt(actions.expiresAt, new Date().toISOString()),
      ),
    )
    .returning();
  return row ?? null;
}
async function finish(
  organizationId: string,
  id: string,
  patch: Partial<Draft>,
) {
  await db
    .update(actions)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(actions.organizationId, organizationId),
        eq(actions.id, id),
        eq(actions.status, "sending"),
      ),
    );
}
async function ensure(input: Draft) {
  await db.insert(actions).values(input).onConflictDoNothing();
  return get(input.organizationId, input.id);
}
async function callbackFor(
  organizationId: string,
  providerConversationId: string,
) {
  const [row] = await db
    .select()
    .from(actions)
    .where(
      and(
        eq(actions.organizationId, organizationId),
        eq(actions.kind, "callback"),
        eq(actions.providerConversationId, providerConversationId),
        eq(actions.status, "completed"),
      ),
    )
    .limit(1);
  return row ?? null;
}
async function completeCallback(
  organizationId: string,
  id: string,
  resultJson: string,
) {
  await db
    .update(actions)
    .set({ resultJson, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(actions.organizationId, organizationId),
        eq(actions.id, id),
        eq(actions.kind, "callback"),
        eq(actions.status, "completed"),
      ),
    );
}
export const ActionRepository = {
  get,
  create,
  list,
  transition,
  finish,
  ensure,
  callbackFor,
  completeCallback,
};

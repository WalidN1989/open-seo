import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { quoteLineItems, quotes } from "@/db/schema";

export type QuoteRow = typeof quotes.$inferSelect;

function now() {
  return new Date().toISOString();
}

async function listQuotes(organizationId: string) {
  return db
    .select()
    .from(quotes)
    .where(eq(quotes.organizationId, organizationId))
    .orderBy(desc(quotes.issueDate), desc(quotes.createdAt))
    .limit(200);
}

async function listForLead(organizationId: string, leadId: string) {
  return db
    .select()
    .from(quotes)
    .where(
      and(eq(quotes.organizationId, organizationId), eq(quotes.leadId, leadId)),
    )
    .orderBy(desc(quotes.createdAt))
    .limit(50);
}

async function getQuote(organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(quotes)
    .where(and(eq(quotes.organizationId, organizationId), eq(quotes.id, id)))
    .limit(1);
  return row ?? null;
}

async function listLines(organizationId: string, quoteId: string) {
  return db
    .select()
    .from(quoteLineItems)
    .where(
      and(
        eq(quoteLineItems.organizationId, organizationId),
        eq(quoteLineItems.quoteId, quoteId),
      ),
    )
    .orderBy(asc(quoteLineItems.position));
}

async function insertQuote(values: typeof quotes.$inferInsert) {
  const [row] = await db.insert(quotes).values(values).returning();
  return row;
}

async function updateQuote(
  organizationId: string,
  id: string,
  patch: Partial<typeof quotes.$inferInsert>,
) {
  const [row] = await db
    .update(quotes)
    .set({ ...patch, updatedAt: now() })
    .where(and(eq(quotes.organizationId, organizationId), eq(quotes.id, id)))
    .returning();
  return row ?? null;
}

async function replaceLines(
  organizationId: string,
  quoteId: string,
  lines: (typeof quoteLineItems.$inferInsert)[],
) {
  await db
    .delete(quoteLineItems)
    .where(
      and(
        eq(quoteLineItems.organizationId, organizationId),
        eq(quoteLineItems.quoteId, quoteId),
      ),
    );
  if (!lines.length) return [];
  return db.insert(quoteLineItems).values(lines).returning();
}

async function deleteQuote(organizationId: string, id: string) {
  await db
    .delete(quotes)
    .where(and(eq(quotes.organizationId, organizationId), eq(quotes.id, id)));
}

export const QuoteRepository = {
  listQuotes,
  listForLead,
  getQuote,
  listLines,
  insertQuote,
  updateQuote,
  replaceLines,
  deleteQuote,
};

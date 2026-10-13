import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  commerceLoyaltyEntries,
  commerceOrders,
  crmContacts,
  businessAuditEvents,
} from "@/db/schema";
async function loyalty(organizationId: string, contactId: string) {
  const [row] = await db
    .select({
      balance: sql<number>`coalesce(sum(${commerceLoyaltyEntries.points}),0)`,
    })
    .from(commerceLoyaltyEntries)
    .where(
      and(
        eq(commerceLoyaltyEntries.organizationId, organizationId),
        eq(commerceLoyaltyEntries.contactId, contactId),
      ),
    );
  return Number(row?.balance ?? 0);
}
async function ensureContact(
  organizationId: string,
  order: typeof commerceOrders.$inferSelect,
) {
  if (order.contactId) {
    const [contact] = await db
      .select()
      .from(crmContacts)
      .where(
        and(
          eq(crmContacts.organizationId, organizationId),
          eq(crmContacts.id, order.contactId),
        ),
      )
      .limit(1);
    return contact?.id ?? null;
  }
  if (!order.customerPhone && !order.customerEmail) return null;
  const matches = await db
    .select({ id: crmContacts.id })
    .from(crmContacts)
    .where(
      and(
        eq(crmContacts.organizationId, organizationId),
        or(
          order.customerPhone
            ? eq(crmContacts.phone, order.customerPhone)
            : undefined,
          order.customerEmail
            ? eq(crmContacts.email, order.customerEmail)
            : undefined,
        ),
      ),
    )
    .limit(2);
  if (matches.length > 1) return null;
  const id =
    matches[0]?.id ||
    `order-customer:${organizationId}:${order.customerPhone || order.customerEmail || order.id}`;
  await db
    .insert(crmContacts)
    .values({
      id,
      organizationId,
      firstName: order.customerName || "Customer",
      phone: order.customerPhone,
      email: order.customerEmail,
    })
    .onConflictDoNothing();
  await db
    .update(commerceOrders)
    .set({ contactId: id })
    .where(
      and(
        eq(commerceOrders.organizationId, organizationId),
        eq(commerceOrders.id, order.id),
      ),
    );
  return id;
}
async function award(
  organizationId: string,
  order: typeof commerceOrders.$inferSelect,
  minorPerPoint: number,
) {
  const contactId = await ensureContact(organizationId, order);
  if (!contactId || minorPerPoint <= 0) return;
  const current = and(
    eq(commerceOrders.organizationId, organizationId),
    eq(commerceOrders.id, order.id),
    eq(commerceOrders.status, "confirmed"),
    eq(commerceOrders.approvalStatus, "approved"),
    sql`${commerceOrders.paymentStatus} <> 'refunded'`,
  );
  await runBatch((tx) => [
    tx
      .update(commerceOrders)
      .set({ updatedAt: sql`${commerceOrders.updatedAt}` })
      .where(current),
    tx
      .insert(commerceLoyaltyEntries)
      .select(
        tx
          .select({
            id: sql<string>`${crypto.randomUUID()}`.as("id"),
            organizationId: commerceOrders.organizationId,
            contactId: sql<string>`${contactId}`.as("contactId"),
            orderId: commerceOrders.id,
            sourceId: commerceOrders.id,
            kind: sql<"earned">`'earned'`.as("kind"),
            points:
              sql<number>`cast(${commerceOrders.totalMinor} / ${minorPerPoint} as integer)`.as(
                "points",
              ),
            note: sql<string | null>`null`.as("note"),
            createdAt: sql<string>`${new Date().toISOString()}`.as("createdAt"),
          })
          .from(commerceOrders)
          .where(current),
      )
      .onConflictDoNothing(),
  ]);
}
async function entries(organizationId: string, contactId: string) {
  return db
    .select()
    .from(commerceLoyaltyEntries)
    .where(
      and(
        eq(commerceLoyaltyEntries.organizationId, organizationId),
        eq(commerceLoyaltyEntries.contactId, contactId),
      ),
    )
    .orderBy(commerceLoyaltyEntries.createdAt)
    .limit(200);
}
async function adjustment(
  organizationId: string,
  userId: string,
  input: {
    contactId: string;
    requestId: string;
    points: number;
    kind: "redeemed" | "reversed";
    note: string;
  },
) {
  const id = `loyalty:${organizationId}:${input.requestId}`;
  const contact = and(
    eq(crmContacts.organizationId, organizationId),
    eq(crmContacts.id, input.contactId),
  );
  const balance = sql`(select coalesce(sum(points),0) from ${commerceLoyaltyEntries} where ${commerceLoyaltyEntries.organizationId} = ${organizationId} and ${commerceLoyaltyEntries.contactId} = ${input.contactId})`;
  await runBatch((tx) => [
    // Serialize debits on the contact row on Postgres; D1 batches serialize writes.
    tx
      .update(crmContacts)
      .set({ updatedAt: sql`${crmContacts.updatedAt}` })
      .where(contact),
    tx
      .insert(commerceLoyaltyEntries)
      .select(
        tx
          .select({
            id: sql<string>`${id}`.as("id"),
            organizationId: crmContacts.organizationId,
            contactId: crmContacts.id,
            orderId: sql<string | null>`null`.as("orderId"),
            sourceId: sql<string>`${input.requestId}`.as("sourceId"),
            kind: sql<"redeemed" | "reversed">`${input.kind}`.as("kind"),
            points: sql<number>`${input.points}`.as("points"),
            note: sql<string>`${input.note}`.as("note"),
            createdAt: sql<string>`${new Date().toISOString()}`.as("createdAt"),
          })
          .from(crmContacts)
          .where(
            and(
              contact,
              sql`${input.points} >= 0 or ${balance} >= ${-input.points}`,
            ),
          ),
      )
      .onConflictDoNothing(),
    tx
      .insert(businessAuditEvents)
      .select(
        tx
          .select({
            id: sql<string>`${id}`.as("id"),
            organizationId: commerceLoyaltyEntries.organizationId,
            actorUserId: sql<string>`${userId}`.as("actorUserId"),
            action: sql<string>`'loyalty.adjusted'`.as("action"),
            targetType: sql<string>`'contact'`.as("targetType"),
            targetId: commerceLoyaltyEntries.contactId,
            metadataJson:
              sql<string>`${JSON.stringify({ points: input.points, kind: input.kind, requestId: input.requestId })}`.as(
                "metadataJson",
              ),
            createdAt: sql<string>`${new Date().toISOString()}`.as("createdAt"),
          })
          .from(commerceLoyaltyEntries)
          .where(
            and(
              eq(commerceLoyaltyEntries.organizationId, organizationId),
              eq(commerceLoyaltyEntries.id, id),
              eq(commerceLoyaltyEntries.contactId, input.contactId),
              eq(commerceLoyaltyEntries.points, input.points),
              eq(commerceLoyaltyEntries.kind, input.kind),
              eq(commerceLoyaltyEntries.note, input.note),
            ),
          ),
      )
      .onConflictDoNothing(),
  ]);
  const [row] = await db
    .select()
    .from(commerceLoyaltyEntries)
    .where(
      and(
        eq(commerceLoyaltyEntries.organizationId, organizationId),
        eq(commerceLoyaltyEntries.id, id),
      ),
    )
    .limit(1);
  return row ?? null;
}
export const OrderLoyaltyRepository = { loyalty, award, entries, adjustment };

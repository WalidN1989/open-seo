import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  commerceLoyaltyEntries,
  commerceOrders,
  crmContacts,
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
  await db
    .insert(commerceLoyaltyEntries)
    .values({
      id: crypto.randomUUID(),
      organizationId,
      orderId: order.id,
      contactId,
      sourceId: order.id,
      kind: "earned",
      points: Math.floor(order.totalMinor / minorPerPoint),
    })
    .onConflictDoNothing();
}
export const OrderLoyaltyRepository = { loyalty, award };

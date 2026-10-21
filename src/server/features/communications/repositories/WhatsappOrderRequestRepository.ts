import { and, desc, eq, getTableColumns, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  businessSettings,
  crmContacts,
  whatsappConversations,
  whatsappOrderRequests,
} from "@/db/schema";
import type { z } from "zod";
import type { updateWhatsappOrderRequestSchema } from "@/types/schemas/communications";

function query() {
  return db
    .select({
      ...getTableColumns(whatsappOrderRequests),
      conversationId: whatsappConversations.id,
      contactId: crmContacts.id,
      customerName: sql<
        string | null
      >`nullif(trim(coalesce(${crmContacts.firstName}, '') || ' ' || coalesce(${crmContacts.lastName}, '')), '')`,
      customerPhone: sql<
        string | null
      >`coalesce(nullif(${whatsappConversations.externalConversationId}, ''), nullif(${crmContacts.whatsappPhone}, ''), nullif(${crmContacts.phone}, ''))`,
      currency: sql<string>`coalesce(${businessSettings.currency}, 'AUD')`,
    })
    .from(whatsappOrderRequests)
    .leftJoin(
      whatsappConversations,
      and(
        eq(whatsappConversations.id, whatsappOrderRequests.conversationId),
        eq(
          whatsappConversations.organizationId,
          whatsappOrderRequests.organizationId,
        ),
      ),
    )
    .leftJoin(
      crmContacts,
      and(
        eq(
          crmContacts.id,
          sql`coalesce(${whatsappOrderRequests.contactId}, ${whatsappConversations.contactId})`,
        ),
        eq(crmContacts.organizationId, whatsappOrderRequests.organizationId),
      ),
    )
    .leftJoin(
      businessSettings,
      eq(businessSettings.organizationId, whatsappOrderRequests.organizationId),
    );
}
async function list(organizationId: string) {
  return query()
    .where(eq(whatsappOrderRequests.organizationId, organizationId))
    .orderBy(desc(whatsappOrderRequests.createdAt));
}
async function get(organizationId: string, requestId: string) {
  const [row] = await query()
    .where(
      and(
        eq(whatsappOrderRequests.organizationId, organizationId),
        eq(whatsappOrderRequests.id, requestId),
      ),
    )
    .limit(1);
  return row ?? null;
}
async function update(
  organizationId: string,
  input: z.infer<typeof updateWhatsappOrderRequestSchema>,
) {
  const { requestId, ...values } = input;
  const [row] = await db
    .update(whatsappOrderRequests)
    .set({ ...values, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(whatsappOrderRequests.organizationId, organizationId),
        eq(whatsappOrderRequests.id, requestId),
        isNull(whatsappOrderRequests.notificationState),
      ),
    )
    .returning();
  return row ?? null;
}
async function claim(organizationId: string, requestId: string) {
  const [row] = await db
    .update(whatsappOrderRequests)
    .set({
      notificationState: "sending",
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(whatsappOrderRequests.organizationId, organizationId),
        eq(whatsappOrderRequests.id, requestId),
        eq(whatsappOrderRequests.status, "available"),
        isNull(whatsappOrderRequests.notificationState),
        isNull(whatsappOrderRequests.notifiedAt),
      ),
    )
    .returning();
  return row ?? null;
}
async function finish(
  organizationId: string,
  requestId: string,
  messageId: string | null,
) {
  const now = new Date().toISOString();
  await db
    .update(whatsappOrderRequests)
    .set({
      notificationState: messageId ? "sent" : "unknown",
      ...(messageId
        ? {
            notificationMessageId: messageId,
            notifiedAt: now,
            status: "notified",
          }
        : {}),
      updatedAt: now,
    })
    .where(
      and(
        eq(whatsappOrderRequests.organizationId, organizationId),
        eq(whatsappOrderRequests.id, requestId),
        eq(whatsappOrderRequests.notificationState, "sending"),
      ),
    );
}
export const WhatsappOrderRequestRepository = {
  list,
  get,
  update,
  claim,
  finish,
};

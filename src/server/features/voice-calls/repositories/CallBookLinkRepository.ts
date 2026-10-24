import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  voiceBookLinkSettings as settings,
  voicePhoneCalls,
  whatsappMessages,
  whatsappConversations,
  commerceProducts,
  whatsappConnections,
} from "@/db/schema";
const messageId = (callId: string) => `voice-book-link:${callId}`;
async function configuration(org: string, connectionId: string) {
  const [row] = await db
    .select()
    .from(settings)
    .where(
      and(
        eq(settings.organizationId, org),
        eq(settings.connectionId, connectionId),
      ),
    )
    .limit(1);
  return row ?? null;
}
async function configure(input: typeof settings.$inferInsert) {
  await db
    .insert(settings)
    .values(input)
    .onConflictDoUpdate({
      target: settings.connectionId,
      set: {
        senderId: input.senderId,
        contentSid: input.contentSid,
        enabled: input.enabled,
        startedAt: input.startedAt,
      },
      setWhere: eq(settings.organizationId, input.organizationId),
    });
}
async function call(org: string, id: string) {
  const [row] = await db
    .select()
    .from(voicePhoneCalls)
    .where(
      and(eq(voicePhoneCalls.organizationId, org), eq(voicePhoneCalls.id, id)),
    )
    .limit(1);
  return row ?? null;
}
async function product(org: string, url: string) {
  const rows = await db
    .select({
      name: commerceProducts.name,
      productUrl: commerceProducts.productUrl,
    })
    .from(commerceProducts)
    .where(
      and(
        eq(commerceProducts.organizationId, org),
        eq(commerceProducts.productUrl, url),
        eq(commerceProducts.status, "active"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}
async function sender(org: string, id: string) {
  const [row] = await db
    .select()
    .from(whatsappConnections)
    .where(
      and(
        eq(whatsappConnections.organizationId, org),
        eq(whatsappConnections.id, id),
      ),
    )
    .limit(1);
  return row ?? null;
}
async function message(org: string, callId: string) {
  const [row] = await db
    .select()
    .from(whatsappMessages)
    .where(
      and(
        eq(whatsappMessages.organizationId, org),
        eq(whatsappMessages.id, messageId(callId)),
      ),
    )
    .limit(1);
  return row ?? null;
}
async function status(org: string, callId: string, value: string) {
  await db
    .update(voicePhoneCalls)
    .set({ bookLinkStatus: value })
    .where(
      and(
        eq(voicePhoneCalls.organizationId, org),
        eq(voicePhoneCalls.id, callId),
      ),
    );
}
async function reserve(input: {
  organizationId: string;
  callId: string;
  senderId: string;
  recipient: string;
  contactId: string | null;
  body: string;
}) {
  const { organizationId: org } = input;
  await db
    .insert(whatsappConversations)
    .values({
      id: crypto.randomUUID(),
      organizationId: org,
      connectionId: input.senderId,
      externalConversationId: input.recipient,
      contactId: input.contactId,
    })
    .onConflictDoNothing();
  const [chat] = await db
    .select()
    .from(whatsappConversations)
    .where(
      and(
        eq(whatsappConversations.organizationId, org),
        eq(whatsappConversations.connectionId, input.senderId),
        eq(whatsappConversations.externalConversationId, input.recipient),
      ),
    )
    .limit(1);
  if (!chat || chat.optedOutAt) return null;
  const [row] = await db
    .insert(whatsappMessages)
    .values({
      id: messageId(input.callId),
      organizationId: org,
      conversationId: chat.id,
      direction: "outbound",
      messageType: "template",
      body: input.body,
      status: "sending",
    })
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}
async function canSend(org: string, chatId: string) {
  const [chat] = await db
    .select({ id: whatsappConversations.id })
    .from(whatsappConversations)
    .where(
      and(
        eq(whatsappConversations.organizationId, org),
        eq(whatsappConversations.id, chatId),
        isNull(whatsappConversations.optedOutAt),
      ),
    )
    .limit(1);
  return Boolean(chat);
}
async function complete(
  org: string,
  id: string,
  values: { externalMessageId?: string; status: string; sentAt?: string },
) {
  await db
    .update(whatsappMessages)
    .set(values)
    .where(
      and(
        eq(whatsappMessages.organizationId, org),
        eq(whatsappMessages.id, id),
      ),
    );
  await db
    .update(whatsappConversations)
    .set({ lastMessageAt: new Date().toISOString() })
    .where(
      and(
        eq(whatsappConversations.organizationId, org),
        sql`${whatsappConversations.id} in (select ${whatsappMessages.conversationId} from ${whatsappMessages} where ${whatsappMessages.id}=${id} and ${whatsappMessages.organizationId}=${org})`,
      ),
    );
}
async function linkMessage(org: string, callId: string, id: string) {
  await db
    .update(voicePhoneCalls)
    .set({ bookLinkMessageId: id })
    .where(
      and(
        eq(voicePhoneCalls.organizationId, org),
        eq(voicePhoneCalls.id, callId),
      ),
    );
}
export const CallBookLinkRepository = {
  linkMessage,
  configuration,
  configure,
  call,
  product,
  sender,
  message,
  status,
  reserve,
  canSend,
  complete,
};

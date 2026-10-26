import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  crmContacts,
  whatsappConversations,
  whatsappMessages,
  whatsappTemplates,
} from "@/db/schema";

/** When a message happened: its send time, or when it was stored. */
const at = sql`coalesce(${whatsappMessages.sentAt}, ${whatsappMessages.createdAt})`;

function lastAt(
  direction: "inbound" | "outbound",
  excludeOutboundMessageId?: string,
) {
  return sql<string | null>`(
    select max(coalesce(m.sent_at, m.created_at)) from whatsapp_messages m
    where m.conversation_id = ${sql.identifier("whatsapp_conversations")}.${sql.identifier("id")}
      and m.organization_id = ${sql.identifier("whatsapp_conversations")}.${sql.identifier("organization_id")}
      and m.direction = ${direction}
      and m.status <> 'failed'
      ${direction === "outbound" && excludeOutboundMessageId ? sql`and m.id <> ${excludeOutboundMessageId}` : sql``}
  )`;
}

/** A workspace's chats with what an agent needs to decide whether to write. */
async function listChats(organizationId: string, limit: number) {
  return db
    .select({
      id: whatsappConversations.id,
      phone: whatsappConversations.externalConversationId,
      status: whatsappConversations.status,
      replyMode: whatsappConversations.replyMode,
      optedOutAt: whatsappConversations.optedOutAt,
      lastMessageAt: whatsappConversations.lastMessageAt,
      lastInboundAt: lastAt("inbound"),
      lastOutboundAt: lastAt("outbound"),
      firstName: crmContacts.firstName,
      lastName: crmContacts.lastName,
    })
    .from(whatsappConversations)
    .leftJoin(
      crmContacts,
      and(
        eq(crmContacts.id, whatsappConversations.contactId),
        eq(crmContacts.organizationId, organizationId),
      ),
    )
    .where(eq(whatsappConversations.organizationId, organizationId))
    .orderBy(desc(whatsappConversations.lastMessageAt))
    .limit(limit);
}

async function getChat(
  organizationId: string,
  conversationId: string,
  excludeOutboundMessageId?: string,
) {
  const [chat] = await db
    .select({
      id: whatsappConversations.id,
      phone: whatsappConversations.externalConversationId,
      status: whatsappConversations.status,
      replyMode: whatsappConversations.replyMode,
      optedOutAt: whatsappConversations.optedOutAt,
      lastInboundAt: lastAt("inbound"),
      lastOutboundAt: lastAt("outbound", excludeOutboundMessageId),
    })
    .from(whatsappConversations)
    .where(
      and(
        eq(whatsappConversations.organizationId, organizationId),
        eq(whatsappConversations.id, conversationId),
      ),
    )
    .limit(1);
  return chat ?? null;
}

async function listMessages(organizationId: string, conversationId: string) {
  const rows = await db
    .select({
      direction: whatsappMessages.direction,
      body: whatsappMessages.body,
      status: whatsappMessages.status,
      at: sql<string>`${at}`,
    })
    .from(whatsappMessages)
    .where(
      and(
        eq(whatsappMessages.organizationId, organizationId),
        eq(whatsappMessages.conversationId, conversationId),
      ),
    )
    .orderBy(desc(at))
    .limit(40);
  return rows.toReversed();
}

async function listApprovedTemplates(organizationId: string) {
  return db
    .select({
      id: whatsappTemplates.id,
      name: whatsappTemplates.name,
      category: whatsappTemplates.category,
      body: whatsappTemplates.body,
      languageCode: whatsappTemplates.languageCode,
      externalTemplateId: whatsappTemplates.externalTemplateId,
    })
    .from(whatsappTemplates)
    .where(
      and(
        eq(whatsappTemplates.organizationId, organizationId),
        eq(whatsappTemplates.status, "approved"),
      ),
    );
}

async function chatsForPhone(organizationId: string, phone: string) {
  return db
    .select({ id: whatsappConversations.id })
    .from(whatsappConversations)
    .where(
      and(
        eq(whatsappConversations.organizationId, organizationId),
        inArray(whatsappConversations.externalConversationId, [
          phone,
          phone.replace(/^\+/, ""),
        ]),
      ),
    );
}
export const WhatsappAgentRepository = {
  chatsForPhone,
  listChats,
  getChat,
  listMessages,
  listApprovedTemplates,
};

import { and, asc, desc, eq, or } from "drizzle-orm";
import { db } from "@/db";
import {
  crmContacts,
  integrationConnections,
  smsConversations,
  smsMessages,
} from "@/db/schema";

const SMS_PROVIDER = "twilio_sms";

export type SmsConversationRow = typeof smsConversations.$inferSelect;

const now = () => new Date().toISOString();

async function getConnectionById(connectionId: string) {
  const [row] = await db
    .select()
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.id, connectionId),
        eq(integrationConnections.providerKey, SMS_PROVIDER),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** The workspace's SMS numbers, newest first; the first is the one it sends from. */
async function listConnections(organizationId: string) {
  return db
    .select()
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.organizationId, organizationId),
        eq(integrationConnections.providerKey, SMS_PROVIDER),
      ),
    )
    .orderBy(desc(integrationConnections.createdAt));
}

async function findContactByPhone(organizationId: string, phone: string) {
  const [row] = await db
    .select({ id: crmContacts.id })
    .from(crmContacts)
    .where(
      and(
        eq(crmContacts.organizationId, organizationId),
        or(eq(crmContacts.phone, phone), eq(crmContacts.whatsappPhone, phone)),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function findConversation(connectionId: string, phone: string) {
  const [row] = await db
    .select()
    .from(smsConversations)
    .where(
      and(
        eq(smsConversations.connectionId, connectionId),
        eq(smsConversations.phone, phone),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function createConversation(values: {
  organizationId: string;
  connectionId: string;
  phone: string;
  contactId: string | null;
}) {
  const at = now();
  const [row] = await db
    .insert(smsConversations)
    .values({
      id: crypto.randomUUID(),
      ...values,
      createdAt: at,
      updatedAt: at,
    })
    .onConflictDoNothing()
    .returning();
  return row ?? (await findConversation(values.connectionId, values.phone));
}

async function updateConversation(
  organizationId: string,
  id: string,
  values: Partial<
    Pick<
      SmsConversationRow,
      | "contactId"
      | "status"
      | "optedOutAt"
      | "lastMessageAt"
      | "lastInboundAt"
      | "lastOutboundAt"
    >
  >,
) {
  await db
    .update(smsConversations)
    .set({ ...values, updatedAt: now() })
    .where(
      and(
        eq(smsConversations.organizationId, organizationId),
        eq(smsConversations.id, id),
      ),
    );
}

async function getConversation(organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(smsConversations)
    .where(
      and(
        eq(smsConversations.organizationId, organizationId),
        eq(smsConversations.id, id),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function listConversations(organizationId: string, limit = 100) {
  return db
    .select({
      conversation: smsConversations,
      firstName: crmContacts.firstName,
      lastName: crmContacts.lastName,
    })
    .from(smsConversations)
    .leftJoin(crmContacts, eq(crmContacts.id, smsConversations.contactId))
    .where(eq(smsConversations.organizationId, organizationId))
    .orderBy(desc(smsConversations.lastMessageAt))
    .limit(limit);
}

async function listMessages(organizationId: string, conversationId: string) {
  const rows = await db
    .select()
    .from(smsMessages)
    .where(
      and(
        eq(smsMessages.organizationId, organizationId),
        eq(smsMessages.conversationId, conversationId),
      ),
    )
    .orderBy(desc(smsMessages.occurredAt))
    .limit(100);
  return rows.toReversed();
}

/** Returns null when Twilio redelivered a message already stored. */
async function insertMessage(values: {
  organizationId: string;
  conversationId: string;
  externalMessageId: string | null;
  direction: "inbound" | "outbound";
  body: string;
  status: string;
  authoredBy: string | null;
  occurredAt: string;
}) {
  const [row] = await db
    .insert(smsMessages)
    .values({ id: crypto.randomUUID(), ...values })
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}

async function updateMessage(
  organizationId: string,
  id: string,
  values: {
    externalMessageId?: string;
    status: string;
    errorMessage?: string | null;
  },
) {
  await db
    .update(smsMessages)
    .set(values)
    .where(
      and(
        eq(smsMessages.organizationId, organizationId),
        eq(smsMessages.id, id),
      ),
    );
}

async function updateStatusByExternalId(
  organizationId: string,
  externalMessageId: string,
  status: string,
  errorMessage: string | null,
) {
  await db
    .update(smsMessages)
    .set({ status, ...(errorMessage ? { errorMessage } : {}) })
    .where(
      and(
        eq(smsMessages.organizationId, organizationId),
        eq(smsMessages.externalMessageId, externalMessageId),
      ),
    );
}

/** A contact's texts across every SMS conversation, for their lead page. */
async function listForContact(
  organizationId: string,
  contactId: string | null,
  phones: string[],
) {
  const matches = [
    ...(contactId ? [eq(smsConversations.contactId, contactId)] : []),
    ...phones.map((phone) => eq(smsConversations.phone, phone)),
  ];
  if (!matches.length) return [];
  return db
    .select({
      id: smsMessages.id,
      direction: smsMessages.direction,
      body: smsMessages.body,
      status: smsMessages.status,
      occurredAt: smsMessages.occurredAt,
    })
    .from(smsMessages)
    .innerJoin(
      smsConversations,
      eq(smsConversations.id, smsMessages.conversationId),
    )
    .where(and(eq(smsMessages.organizationId, organizationId), or(...matches)))
    .orderBy(asc(smsMessages.occurredAt))
    .limit(60);
}

export const SmsRepository = {
  getConnectionById,
  listConnections,
  findContactByPhone,
  findConversation,
  createConversation,
  updateConversation,
  getConversation,
  listConversations,
  listMessages,
  insertMessage,
  updateMessage,
  updateStatusByExternalId,
  listForContact,
};

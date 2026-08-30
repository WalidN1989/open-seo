import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  integrationConnections,
  voiceAgentConfigs,
  voiceConversations,
  webhookEndpoints,
  whatsappAutomationRules,
  whatsappCampaigns,
  whatsappConnections,
  whatsappConversations,
  whatsappMessages,
  whatsappOrderRequests,
  whatsappTemplates,
} from "@/db/schema";
import type { z } from "zod";
import type {
  createIntegrationSchema,
  createVoiceAgentSchema,
  createWhatsappConnectionSchema,
  createWhatsappTemplateSchema,
} from "@/types/schemas/communications";
import type {
  InboundWhatsappMessage,
  WhatsappDeliveryUpdate,
} from "../providers/whatsapp";

async function getWhatsappConnectionById(connectionId: string) {
  const [connection] = await db
    .select()
    .from(whatsappConnections)
    .where(eq(whatsappConnections.id, connectionId))
    .limit(1);
  return connection;
}

async function ingestWhatsappMessage(
  connection: NonNullable<
    Awaited<ReturnType<typeof getWhatsappConnectionById>>
  >,
  message: InboundWhatsappMessage,
) {
  const [duplicate] = await db
    .select({ id: whatsappMessages.id })
    .from(whatsappMessages)
    .where(
      and(
        eq(whatsappMessages.organizationId, connection.organizationId),
        eq(whatsappMessages.externalMessageId, message.externalMessageId),
      ),
    )
    .limit(1);
  if (duplicate) return { duplicate: true };

  const [existingConversation] = await db
    .select()
    .from(whatsappConversations)
    .where(
      and(
        eq(whatsappConversations.connectionId, connection.id),
        eq(whatsappConversations.externalConversationId, message.sender),
      ),
    )
    .limit(1);
  const conversationId = existingConversation?.id ?? crypto.randomUUID();
  if (!existingConversation) {
    await db.insert(whatsappConversations).values({
      id: conversationId,
      organizationId: connection.organizationId,
      connectionId: connection.id,
      externalConversationId: message.sender,
      lastMessageAt: message.receivedAt,
    });
  }
  await db.insert(whatsappMessages).values({
    id: crypto.randomUUID(),
    organizationId: connection.organizationId,
    conversationId,
    externalMessageId: message.externalMessageId,
    direction: "inbound",
    messageType: message.messageType,
    body: message.body,
    status: "received",
    sentAt: message.receivedAt,
  });
  if (existingConversation) {
    await db
      .update(whatsappConversations)
      .set({ lastMessageAt: message.receivedAt, status: "open" })
      .where(
        and(
          eq(whatsappConversations.id, conversationId),
          eq(whatsappConversations.organizationId, connection.organizationId),
        ),
      );
  }
  return { duplicate: false };
}

async function updateWhatsappDelivery(
  connection: NonNullable<
    Awaited<ReturnType<typeof getWhatsappConnectionById>>
  >,
  update: WhatsappDeliveryUpdate,
) {
  return db
    .update(whatsappMessages)
    .set({ status: update.status })
    .where(
      and(
        eq(whatsappMessages.organizationId, connection.organizationId),
        eq(whatsappMessages.externalMessageId, update.externalMessageId),
      ),
    );
}

async function markWhatsappConnectionConnected(connectionId: string) {
  await db
    .update(whatsappConnections)
    .set({ status: "connected", updatedAt: new Date().toISOString() })
    .where(eq(whatsappConnections.id, connectionId));
}

async function getWhatsappConversationForSend(
  organizationId: string,
  conversationId: string,
) {
  const [conversation] = await db
    .select()
    .from(whatsappConversations)
    .where(
      and(
        eq(whatsappConversations.id, conversationId),
        eq(whatsappConversations.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!conversation) return null;
  const connection = await getWhatsappConnectionById(conversation.connectionId);
  if (!connection || connection.organizationId !== organizationId) return null;
  return { conversation, connection };
}

async function createQueuedWhatsappMessage(
  organizationId: string,
  conversationId: string,
  body: string,
) {
  const [row] = await db
    .insert(whatsappMessages)
    .values({
      id: crypto.randomUUID(),
      organizationId,
      conversationId,
      direction: "outbound",
      messageType: "text",
      body,
      status: "queued",
    })
    .returning();
  return row;
}

async function completeWhatsappMessage(
  organizationId: string,
  messageId: string,
  values: { externalMessageId?: string; status: string; sentAt?: string },
) {
  const [row] = await db
    .update(whatsappMessages)
    .set(values)
    .where(
      and(
        eq(whatsappMessages.id, messageId),
        eq(whatsappMessages.organizationId, organizationId),
      ),
    )
    .returning();
  return row;
}

async function getWhatsappWorkspace(organizationId: string) {
  const [
    connections,
    conversations,
    templates,
    campaigns,
    automations,
    orders,
  ] = await Promise.all([
    db
      .select()
      .from(whatsappConnections)
      .where(eq(whatsappConnections.organizationId, organizationId)),
    db
      .select()
      .from(whatsappConversations)
      .where(eq(whatsappConversations.organizationId, organizationId))
      .orderBy(desc(whatsappConversations.lastMessageAt)),
    db
      .select()
      .from(whatsappTemplates)
      .where(eq(whatsappTemplates.organizationId, organizationId))
      .orderBy(desc(whatsappTemplates.createdAt)),
    db
      .select()
      .from(whatsappCampaigns)
      .where(eq(whatsappCampaigns.organizationId, organizationId))
      .orderBy(desc(whatsappCampaigns.createdAt)),
    db
      .select()
      .from(whatsappAutomationRules)
      .where(eq(whatsappAutomationRules.organizationId, organizationId)),
    db
      .select()
      .from(whatsappOrderRequests)
      .where(eq(whatsappOrderRequests.organizationId, organizationId))
      .orderBy(desc(whatsappOrderRequests.createdAt)),
  ]);
  return {
    connections,
    conversations,
    templates,
    campaigns,
    automations,
    orders,
  };
}

async function createWhatsappConnection(
  organizationId: string,
  input: z.infer<typeof createWhatsappConnectionSchema>,
) {
  const [row] = await db
    .insert(whatsappConnections)
    .values({
      id: crypto.randomUUID(),
      organizationId,
      ...input,
      status: "disconnected",
    })
    .returning();
  return row;
}

async function createWhatsappTemplate(
  organizationId: string,
  input: z.infer<typeof createWhatsappTemplateSchema>,
) {
  const [row] = await db
    .insert(whatsappTemplates)
    .values({ id: crypto.randomUUID(), organizationId, ...input })
    .returning();
  return row;
}

async function getVoiceWorkspace(organizationId: string) {
  const [agents, conversations] = await Promise.all([
    db
      .select()
      .from(voiceAgentConfigs)
      .where(eq(voiceAgentConfigs.organizationId, organizationId))
      .orderBy(desc(voiceAgentConfigs.createdAt)),
    db
      .select()
      .from(voiceConversations)
      .where(eq(voiceConversations.organizationId, organizationId))
      .orderBy(desc(voiceConversations.startedAt)),
  ]);
  return { agents, conversations };
}

async function createVoiceAgent(
  organizationId: string,
  input: z.infer<typeof createVoiceAgentSchema>,
) {
  const [row] = await db
    .insert(voiceAgentConfigs)
    .values({ id: crypto.randomUUID(), organizationId, ...input })
    .returning();
  return row;
}

async function getIntegrationsWorkspace(organizationId: string) {
  const [connections, webhooks] = await Promise.all([
    db
      .select()
      .from(integrationConnections)
      .where(eq(integrationConnections.organizationId, organizationId))
      .orderBy(desc(integrationConnections.createdAt)),
    db
      .select()
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.organizationId, organizationId))
      .orderBy(desc(webhookEndpoints.createdAt)),
  ]);
  return { connections, webhooks };
}

async function createIntegration(
  organizationId: string,
  input: z.infer<typeof createIntegrationSchema>,
) {
  const [row] = await db
    .insert(integrationConnections)
    .values({
      id: crypto.randomUUID(),
      organizationId,
      ...input,
      status: input.credentialReference ? "connected" : "disconnected",
    })
    .returning();
  return row;
}

export const CommunicationsRepository = {
  completeWhatsappMessage,
  createIntegration,
  createQueuedWhatsappMessage,
  createVoiceAgent,
  createWhatsappConnection,
  createWhatsappTemplate,
  getIntegrationsWorkspace,
  getVoiceWorkspace,
  getWhatsappWorkspace,
  getWhatsappConnectionById,
  getWhatsappConversationForSend,
  ingestWhatsappMessage,
  markWhatsappConnectionConnected,
  updateWhatsappDelivery,
};

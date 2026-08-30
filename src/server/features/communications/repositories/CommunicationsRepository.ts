/* oxlint-disable max-lines */
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  integrationConnections,
  crmContacts,
  member,
  voiceAgentConfigs,
  voiceConversationMessages,
  voiceConversations,
  webhookDeliveries,
  webhookEndpoints,
  webhookSubscriptions,
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
  appendVoiceTranscriptSchema,
  startVoiceConversationSchema,
  createWhatsappConnectionSchema,
  createWhatsappAutomationSchema,
  createWhatsappCampaignSchema,
  createWhatsappOrderSchema,
  createWhatsappTemplateSchema,
  createWebhookEndpointSchema,
  updateWhatsappConversationSchema,
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
  if (duplicate) return { duplicate: true, conversationId: null, isNew: false };

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
  return { duplicate: false, conversationId, isNew: !existingConversation };
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

async function getWhatsappConversationHistory(
  organizationId: string,
  conversationId: string,
) {
  const rows = await db
    .select({
      direction: whatsappMessages.direction,
      body: whatsappMessages.body,
    })
    .from(whatsappMessages)
    .where(
      and(
        eq(whatsappMessages.organizationId, organizationId),
        eq(whatsappMessages.conversationId, conversationId),
      ),
    )
    .orderBy(desc(whatsappMessages.createdAt))
    .limit(24);
  return rows.toReversed();
}

async function flagWhatsappConversationForTeam(
  organizationId: string,
  conversationId: string,
) {
  return db
    .update(whatsappConversations)
    .set({ status: "pending" })
    .where(
      and(
        eq(whatsappConversations.organizationId, organizationId),
        eq(whatsappConversations.id, conversationId),
      ),
    );
}

async function getIntegrationByProvider(
  organizationId: string,
  providerKey: string,
) {
  const [row] = await db
    .select()
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.organizationId, organizationId),
        eq(integrationConnections.providerKey, providerKey),
      ),
    )
    .limit(1);
  return row;
}

async function getIntegration(organizationId: string, connectionId: string) {
  const [row] = await db
    .select()
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.organizationId, organizationId),
        eq(integrationConnections.id, connectionId),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function updateIntegrationStatus(
  organizationId: string,
  connectionId: string,
  status: "connected" | "disconnected" | "error",
) {
  const [row] = await db
    .update(integrationConnections)
    .set({
      status,
      lastSyncedAt: status === "connected" ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(integrationConnections.organizationId, organizationId),
        eq(integrationConnections.id, connectionId),
      ),
    )
    .returning();
  return row;
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
    contacts,
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
      .from(crmContacts)
      .where(eq(crmContacts.organizationId, organizationId))
      .orderBy(desc(crmContacts.updatedAt)),
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
    contacts,
    templates,
    campaigns,
    automations,
    orders,
  };
}

async function updateWhatsappConversation(
  organizationId: string,
  input: z.infer<typeof updateWhatsappConversationSchema>,
) {
  const { conversationId, ...changes } = input;
  const [row] = await db
    .update(whatsappConversations)
    .set(changes)
    .where(
      and(
        eq(whatsappConversations.id, conversationId),
        eq(whatsappConversations.organizationId, organizationId),
      ),
    )
    .returning();
  return row ?? null;
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

async function whatsappEntityBelongsToOrganization(
  organizationId: string,
  entity: "connection" | "template" | "conversation" | "contact",
  id: string,
) {
  const tables = {
    connection: whatsappConnections,
    template: whatsappTemplates,
    conversation: whatsappConversations,
    contact: crmContacts,
  } as const;
  const table = tables[entity];
  const [row] = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, id), eq(table.organizationId, organizationId)))
    .limit(1);
  return Boolean(row);
}

async function createWhatsappCampaign(
  organizationId: string,
  input: z.infer<typeof createWhatsappCampaignSchema>,
) {
  const [row] = await db
    .insert(whatsappCampaigns)
    .values({ id: crypto.randomUUID(), organizationId, ...input })
    .returning();
  return row;
}

async function getWhatsappCampaignContext(
  organizationId: string,
  campaignId: string,
) {
  const [campaign] = await db
    .select()
    .from(whatsappCampaigns)
    .where(
      and(
        eq(whatsappCampaigns.id, campaignId),
        eq(whatsappCampaigns.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!campaign?.connectionId || !campaign.templateId) return null;
  const connection = await getWhatsappConnectionById(campaign.connectionId);
  const template = await getWhatsappTemplate(
    organizationId,
    campaign.templateId,
  );
  if (
    !connection ||
    connection.organizationId !== organizationId ||
    !template
  ) {
    return null;
  }
  const conversations = await db
    .select()
    .from(whatsappConversations)
    .where(
      and(
        eq(whatsappConversations.organizationId, organizationId),
        eq(whatsappConversations.connectionId, connection.id),
        eq(whatsappConversations.status, "open"),
      ),
    );
  return { campaign, connection, template, conversations };
}

async function updateWhatsappCampaign(
  organizationId: string,
  campaignId: string,
  values: { status: string; startedAt?: string; completedAt?: string },
) {
  const [campaign] = await db
    .update(whatsappCampaigns)
    .set({ ...values, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(whatsappCampaigns.id, campaignId),
        eq(whatsappCampaigns.organizationId, organizationId),
      ),
    )
    .returning();
  return campaign;
}

async function listMatchingWhatsappAutomations(
  organizationId: string,
  messageBody: string | undefined,
  isFirstMessage: boolean,
) {
  const rules = await db
    .select()
    .from(whatsappAutomationRules)
    .where(
      and(
        eq(whatsappAutomationRules.organizationId, organizationId),
        eq(whatsappAutomationRules.status, "active"),
      ),
    );
  const normalized = messageBody?.toLowerCase() ?? "";
  return rules.filter((rule) => {
    if (rule.triggerType === "first_message") return isFirstMessage;
    return (
      rule.triggerType === "keyword" &&
      Boolean(rule.matchValue) &&
      normalized.includes(rule.matchValue?.toLowerCase() ?? "")
    );
  });
}

async function getWhatsappTemplate(organizationId: string, templateId: string) {
  const [template] = await db
    .select()
    .from(whatsappTemplates)
    .where(
      and(
        eq(whatsappTemplates.id, templateId),
        eq(whatsappTemplates.organizationId, organizationId),
      ),
    )
    .limit(1);
  return template;
}

async function createWhatsappAutomation(
  organizationId: string,
  input: z.infer<typeof createWhatsappAutomationSchema>,
) {
  const [row] = await db
    .insert(whatsappAutomationRules)
    .values({
      id: crypto.randomUUID(),
      organizationId,
      ...input,
      status: "active",
    })
    .returning();
  return row;
}

async function createWhatsappOrder(
  organizationId: string,
  input: z.infer<typeof createWhatsappOrderSchema>,
) {
  const [row] = await db
    .insert(whatsappOrderRequests)
    .values({ id: crypto.randomUUID(), organizationId, ...input })
    .returning();
  return row;
}

async function getVoiceWorkspace(organizationId: string) {
  const [agents, conversations, messages] = await Promise.all([
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
    db
      .select()
      .from(voiceConversationMessages)
      .where(eq(voiceConversationMessages.organizationId, organizationId))
      .orderBy(desc(voiceConversationMessages.createdAt))
      .limit(500),
  ]);
  return { agents, conversations, messages };
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

async function getVoiceAgent(organizationId: string, agentConfigId: string) {
  const [agent] = await db
    .select()
    .from(voiceAgentConfigs)
    .where(
      and(
        eq(voiceAgentConfigs.id, agentConfigId),
        eq(voiceAgentConfigs.organizationId, organizationId),
      ),
    )
    .limit(1);
  return agent;
}

async function contactBelongsToOrganization(
  organizationId: string,
  contactId: string,
) {
  const [contact] = await db
    .select({ id: crmContacts.id })
    .from(crmContacts)
    .where(
      and(
        eq(crmContacts.id, contactId),
        eq(crmContacts.organizationId, organizationId),
      ),
    )
    .limit(1);
  return Boolean(contact);
}

async function memberBelongsToOrganization(
  organizationId: string,
  memberId: string,
) {
  const [membership] = await db
    .select({ id: member.id })
    .from(member)
    .where(
      and(eq(member.id, memberId), eq(member.organizationId, organizationId)),
    )
    .limit(1);
  return Boolean(membership);
}

async function startVoiceConversation(
  organizationId: string,
  input: z.infer<typeof startVoiceConversationSchema>,
) {
  const [conversation] = await db
    .insert(voiceConversations)
    .values({
      id: crypto.randomUUID(),
      organizationId,
      ...input,
      channel: "browser",
      startedAt: new Date().toISOString(),
    })
    .returning();
  return conversation;
}

async function getVoiceConversation(
  organizationId: string,
  conversationId: string,
) {
  const [conversation] = await db
    .select()
    .from(voiceConversations)
    .where(
      and(
        eq(voiceConversations.id, conversationId),
        eq(voiceConversations.organizationId, organizationId),
      ),
    )
    .limit(1);
  return conversation;
}

async function getVoiceConversationMessages(
  organizationId: string,
  conversationId: string,
) {
  return db
    .select()
    .from(voiceConversationMessages)
    .where(
      and(
        eq(voiceConversationMessages.organizationId, organizationId),
        eq(voiceConversationMessages.conversationId, conversationId),
      ),
    )
    .orderBy(desc(voiceConversationMessages.createdAt))
    .limit(24)
    .then((rows) => rows.toReversed());
}

async function appendVoiceTranscript(
  organizationId: string,
  input: z.infer<typeof appendVoiceTranscriptSchema>,
) {
  const [message] = await db
    .insert(voiceConversationMessages)
    .values({ id: crypto.randomUUID(), organizationId, ...input })
    .returning();
  return message;
}

async function endVoiceConversation(
  organizationId: string,
  conversationId: string,
) {
  const [conversation] = await db
    .update(voiceConversations)
    .set({ status: "completed", endedAt: new Date().toISOString() })
    .where(
      and(
        eq(voiceConversations.id, conversationId),
        eq(voiceConversations.organizationId, organizationId),
      ),
    )
    .returning();
  return conversation;
}

async function getIntegrationsWorkspace(organizationId: string) {
  const [connections, webhooks, subscriptions, deliveries] = await Promise.all([
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
    db
      .select()
      .from(webhookSubscriptions)
      .where(eq(webhookSubscriptions.organizationId, organizationId)),
    db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.organizationId, organizationId))
      .orderBy(desc(webhookDeliveries.createdAt))
      .limit(50),
  ]);
  return { connections, webhooks, subscriptions, deliveries };
}

async function createWebhookEndpoint(
  organizationId: string,
  input: z.infer<typeof createWebhookEndpointSchema>,
) {
  const endpointId = crypto.randomUUID();
  const [endpoint] = await db
    .insert(webhookEndpoints)
    .values({
      id: endpointId,
      organizationId,
      name: input.name,
      direction: "outbound",
      url: input.url,
      secretReference: input.secretReference,
    })
    .returning();
  await db.insert(webhookSubscriptions).values(
    input.eventTypes.map((eventType) => ({
      id: crypto.randomUUID(),
      organizationId,
      endpointId,
      eventType,
    })),
  );
  return endpoint;
}

async function getWebhookEndpoint(organizationId: string, endpointId: string) {
  const [endpoint] = await db
    .select()
    .from(webhookEndpoints)
    .where(
      and(
        eq(webhookEndpoints.id, endpointId),
        eq(webhookEndpoints.organizationId, organizationId),
      ),
    )
    .limit(1);
  return endpoint;
}

async function listWebhookEndpointsForEvent(
  organizationId: string,
  eventType: string,
) {
  return db
    .select({ endpoint: webhookEndpoints })
    .from(webhookSubscriptions)
    .innerJoin(
      webhookEndpoints,
      eq(webhookSubscriptions.endpointId, webhookEndpoints.id),
    )
    .where(
      and(
        eq(webhookSubscriptions.organizationId, organizationId),
        eq(webhookSubscriptions.eventType, eventType),
        eq(webhookEndpoints.status, "active"),
      ),
    );
}

async function createWebhookDelivery(
  organizationId: string,
  endpointId: string,
  eventType: string,
  payloadJson: string,
) {
  const [delivery] = await db
    .insert(webhookDeliveries)
    .values({
      id: crypto.randomUUID(),
      organizationId,
      endpointId,
      eventType,
      payloadJson,
    })
    .returning();
  return delivery;
}

async function getWebhookDelivery(organizationId: string, deliveryId: string) {
  const [delivery] = await db
    .select()
    .from(webhookDeliveries)
    .where(
      and(
        eq(webhookDeliveries.id, deliveryId),
        eq(webhookDeliveries.organizationId, organizationId),
      ),
    )
    .limit(1);
  return delivery;
}

async function updateWebhookDelivery(
  organizationId: string,
  deliveryId: string,
  values: {
    status: string;
    responseStatus?: number;
    responseBody?: string;
    attemptCount: number;
    lastAttemptAt: string;
    nextAttemptAt?: string | null;
    errorMessage?: string | null;
  },
) {
  const [delivery] = await db
    .update(webhookDeliveries)
    .set(values)
    .where(
      and(
        eq(webhookDeliveries.id, deliveryId),
        eq(webhookDeliveries.organizationId, organizationId),
      ),
    )
    .returning();
  return delivery;
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
      status: "disconnected",
    })
    .returning();
  return row;
}

export const CommunicationsRepository = {
  appendVoiceTranscript,
  completeWhatsappMessage,
  contactBelongsToOrganization,
  createIntegration,
  createQueuedWhatsappMessage,
  createVoiceAgent,
  createWebhookDelivery,
  createWebhookEndpoint,
  createWhatsappConnection,
  createWhatsappAutomation,
  createWhatsappCampaign,
  createWhatsappOrder,
  createWhatsappTemplate,
  endVoiceConversation,
  flagWhatsappConversationForTeam,
  getIntegrationsWorkspace,
  getIntegrationByProvider,
  getIntegration,
  getVoiceWorkspace,
  getVoiceAgent,
  getVoiceConversation,
  getVoiceConversationMessages,
  getWebhookDelivery,
  getWebhookEndpoint,
  listWebhookEndpointsForEvent,
  listMatchingWhatsappAutomations,
  memberBelongsToOrganization,
  getWhatsappWorkspace,
  getWhatsappCampaignContext,
  getWhatsappConnectionById,
  getWhatsappConversationForSend,
  getWhatsappConversationHistory,
  getWhatsappTemplate,
  ingestWhatsappMessage,
  markWhatsappConnectionConnected,
  startVoiceConversation,
  updateWhatsappCampaign,
  updateWhatsappConversation,
  updateIntegrationStatus,
  updateWhatsappDelivery,
  updateWebhookDelivery,
  whatsappEntityBelongsToOrganization,
};

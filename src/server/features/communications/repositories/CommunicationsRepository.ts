/* oxlint-disable max-lines */
import { and, count, desc, eq, isNotNull, lte, sql } from "drizzle-orm";
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
  whatsappContactProfiles,
  whatsappTags,
  whatsappContactTagAssignments,
  whatsappContactAttributes,
  whatsappInternalNotes,
  whatsappOrderRequests,
  whatsappTemplates,
} from "@/db/schema";
import type { z } from "zod";
import type {
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
  updateWhatsappContactProfileSchema,
  addWhatsappContactTagSchema,
  upsertWhatsappContactAttributeSchema,
  createWhatsappInternalNoteSchema,
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

/**
 * Route an inbound Meta delivery to exactly one connection.
 *
 * Deliberately not organization-scoped: the organization is the *answer* here,
 * derived from the stored row. The unique index on (provider, phone_number_id)
 * is what makes the answer unambiguous.
 */
async function findWhatsappConnectionByPhoneNumberId(phoneNumberId: string) {
  const [row] = await db
    .select()
    .from(whatsappConnections)
    .where(
      and(
        eq(whatsappConnections.provider, "meta_cloud"),
        eq(whatsappConnections.phoneNumberId, phoneNumberId),
      ),
    )
    .limit(1);
  return row ?? null;
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
  // The select above catches the ordinary replay; this catches the concurrent
  // one. Without it the unique index raises, the handler 500s, and Meta
  // retries the delivery it had already stored.
  const inserted = await db
    .insert(whatsappMessages)
    .values({
      id: crypto.randomUUID(),
      organizationId: connection.organizationId,
      conversationId,
      externalMessageId: message.externalMessageId,
      direction: "inbound",
      messageType: message.messageType,
      body: message.body,
      status: "received",
      sentAt: message.receivedAt,
    })
    .onConflictDoNothing()
    .returning({ id: whatsappMessages.id });
  if (inserted.length === 0) {
    return { duplicate: true, conversationId: null, isNew: false };
  }
  if (existingConversation) {
    await db
      .update(whatsappConversations)
      // A new message reopens a solved chat. It does not un-flag one that is
      // waiting for a person: the customer writing again is exactly the case
      // the flag exists for, and the assistant reads "pending" as hands-off.
      .set({
        lastMessageAt: message.receivedAt,
        status: sql`case when ${whatsappConversations.status} = 'pending' then 'pending' else 'open' end`,
      })
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

/**
 * Records the outcome of a connection test.
 *
 * updateIntegrationStatus writes the status alone, which left a failed check
 * showing "Connection problem" beside "Not checked yet" — the badge knew and
 * the timestamp did not.
 */
async function recordIntegrationCheck(
  organizationId: string,
  connectionId: string,
  outcome: { status: "connected" | "error"; detail: string },
) {
  await db
    .update(integrationConnections)
    .set({
      status: outcome.status,
      lastCheckedAt: new Date().toISOString(),
      healthDetail: outcome.detail.slice(0, 300),
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(integrationConnections.organizationId, organizationId),
        eq(integrationConnections.id, connectionId),
      ),
    );
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

async function updateIntegration(
  organizationId: string,
  connectionId: string,
  input: {
    displayName: string;
    credentialReference?: string;
    /** Already-encrypted blob; the service owns encryption. */
    credentials: string | null;
  },
) {
  const [row] = await db
    .update(integrationConnections)
    .set({
      displayName: input.displayName,
      credentialReference: input.credentialReference ?? null,
      credentials: input.credentials,
      // The reference is what the credentials are read under, so changing it
      // invalidates every earlier verification. Make the page say "unverified"
      // rather than keep showing a green tick for keys nobody has checked.
      status: "disconnected",
      lastCheckedAt: null,
      healthDetail: null,
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

async function deleteIntegration(organizationId: string, connectionId: string) {
  const [row] = await db
    .delete(integrationConnections)
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
    messages,
    contacts,
    messageStats,
    templates,
    campaigns,
    automations,
    orders,
    contactProfiles,
    tags,
    contactTagAssignments,
    contactAttributes,
    internalNotes,
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
      .from(whatsappMessages)
      .where(eq(whatsappMessages.organizationId, organizationId))
      .orderBy(whatsappMessages.createdAt),
    db
      .select()
      .from(crmContacts)
      .where(eq(crmContacts.organizationId, organizationId))
      .orderBy(desc(crmContacts.updatedAt)),
    db
      .select({
        direction: whatsappMessages.direction,
        status: whatsappMessages.status,
        count: count(),
      })
      .from(whatsappMessages)
      .where(eq(whatsappMessages.organizationId, organizationId))
      .groupBy(whatsappMessages.direction, whatsappMessages.status),
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
    db
      .select()
      .from(whatsappContactProfiles)
      .where(eq(whatsappContactProfiles.organizationId, organizationId)),
    db
      .select()
      .from(whatsappTags)
      .where(eq(whatsappTags.organizationId, organizationId))
      .orderBy(whatsappTags.name),
    db
      .select()
      .from(whatsappContactTagAssignments)
      .where(eq(whatsappContactTagAssignments.organizationId, organizationId)),
    db
      .select()
      .from(whatsappContactAttributes)
      .where(eq(whatsappContactAttributes.organizationId, organizationId))
      .orderBy(whatsappContactAttributes.key),
    db
      .select()
      .from(whatsappInternalNotes)
      .where(eq(whatsappInternalNotes.organizationId, organizationId))
      .orderBy(whatsappInternalNotes.createdAt),
  ]);
  return {
    connections,
    conversations,
    messages,
    contacts,
    messageStats,
    templates,
    campaigns,
    automations,
    orders,
    contactProfiles,
    tags,
    contactTagAssignments,
    contactAttributes,
    internalNotes,
  };
}

async function updateWhatsappContactProfile(
  organizationId: string,
  input: z.infer<typeof updateWhatsappContactProfileSchema>,
) {
  const { contactId, ...changes } = input;
  const [existing] = await db
    .select()
    .from(whatsappContactProfiles)
    .where(
      and(
        eq(whatsappContactProfiles.organizationId, organizationId),
        eq(whatsappContactProfiles.contactId, contactId),
      ),
    )
    .limit(1);
  if (existing) {
    const [row] = await db
      .update(whatsappContactProfiles)
      .set({ ...changes, updatedAt: new Date().toISOString() })
      .where(eq(whatsappContactProfiles.id, existing.id))
      .returning();
    return row;
  }
  const [row] = await db
    .insert(whatsappContactProfiles)
    .values({
      id: crypto.randomUUID(),
      organizationId,
      contactId,
      ...changes,
    })
    .returning();
  return row;
}

async function addWhatsappContactTag(
  organizationId: string,
  input: z.infer<typeof addWhatsappContactTagSchema>,
) {
  const normalizedName = input.name.trim();
  let [tag] = await db
    .select()
    .from(whatsappTags)
    .where(
      and(
        eq(whatsappTags.organizationId, organizationId),
        eq(whatsappTags.name, normalizedName),
      ),
    )
    .limit(1);
  if (!tag) {
    [tag] = await db
      .insert(whatsappTags)
      .values({
        id: crypto.randomUUID(),
        organizationId,
        name: normalizedName,
      })
      .returning();
  }
  const [existing] = await db
    .select()
    .from(whatsappContactTagAssignments)
    .where(
      and(
        eq(whatsappContactTagAssignments.contactId, input.contactId),
        eq(whatsappContactTagAssignments.tagId, tag.id),
      ),
    )
    .limit(1);
  if (!existing)
    await db.insert(whatsappContactTagAssignments).values({
      id: crypto.randomUUID(),
      organizationId,
      contactId: input.contactId,
      tagId: tag.id,
    });
  return tag;
}

async function upsertWhatsappContactAttribute(
  organizationId: string,
  input: z.infer<typeof upsertWhatsappContactAttributeSchema>,
) {
  const [existing] = await db
    .select()
    .from(whatsappContactAttributes)
    .where(
      and(
        eq(whatsappContactAttributes.contactId, input.contactId),
        eq(whatsappContactAttributes.key, input.key),
      ),
    )
    .limit(1);
  if (existing) {
    const [row] = await db
      .update(whatsappContactAttributes)
      .set({ value: input.value, updatedAt: new Date().toISOString() })
      .where(eq(whatsappContactAttributes.id, existing.id))
      .returning();
    return row;
  }
  const [row] = await db
    .insert(whatsappContactAttributes)
    .values({ id: crypto.randomUUID(), organizationId, ...input })
    .returning();
  return row;
}

async function createWhatsappInternalNote(
  organizationId: string,
  authorMemberId: string,
  input: z.infer<typeof createWhatsappInternalNoteSchema>,
) {
  const [row] = await db
    .insert(whatsappInternalNotes)
    .values({
      id: crypto.randomUUID(),
      organizationId,
      authorMemberId,
      ...input,
    })
    .returning();
  return row;
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

async function getWhatsappConnection(
  organizationId: string,
  connectionId: string,
) {
  const [row] = await db
    .select()
    .from(whatsappConnections)
    .where(
      and(
        eq(whatsappConnections.organizationId, organizationId),
        eq(whatsappConnections.id, connectionId),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function updateWhatsappConnection(
  organizationId: string,
  connectionId: string,
  input: {
    displayPhoneNumber?: string;
    phoneNumberId?: string;
    businessAccountId?: string;
    credentialReference?: string;
    /** Already-encrypted blob; the service owns encryption. */
    credentials: string | null;
  },
) {
  const [row] = await db
    .update(whatsappConnections)
    .set({ ...input, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(whatsappConnections.organizationId, organizationId),
        eq(whatsappConnections.id, connectionId),
      ),
    )
    .returning();
  return row ?? null;
}

async function createWhatsappConnection(
  organizationId: string,
  input: Omit<z.infer<typeof createWhatsappConnectionSchema>, "accessToken"> & {
    credentials: string | null;
  },
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
    .values({
      id: crypto.randomUUID(),
      organizationId,
      ...input,
      status: "active",
    })
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

// Deliveries whose backoff has elapsed, across every organization. The
// scheduler is the only caller: it runs outside any tenant's request, so this
// is deliberately not organization-scoped — every other read in this file is.
async function listDueWebhookDeliveries(now: string, limit: number) {
  return db
    .select()
    .from(webhookDeliveries)
    .where(
      and(
        eq(webhookDeliveries.status, "failed"),
        isNotNull(webhookDeliveries.nextAttemptAt),
        lte(webhookDeliveries.nextAttemptAt, now),
      ),
    )
    .orderBy(webhookDeliveries.nextAttemptAt)
    .limit(limit);
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
  input: {
    providerKey: string;
    displayName: string;
    credentialReference?: string;
    /** Already-encrypted blob; the service owns encryption. */
    credentials: string | null;
  },
) {
  const [row] = await db
    .insert(integrationConnections)
    .values({
      id: crypto.randomUUID(),
      organizationId,
      providerKey: input.providerKey,
      displayName: input.displayName,
      credentialReference: input.credentialReference ?? null,
      credentials: input.credentials,
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
  deleteIntegration,
  createQueuedWhatsappMessage,
  createVoiceAgent,
  createWebhookDelivery,
  createWebhookEndpoint,
  createWhatsappConnection,
  getWhatsappConnection,
  updateWhatsappConnection,
  createWhatsappAutomation,
  createWhatsappCampaign,
  createWhatsappOrder,
  createWhatsappTemplate,
  endVoiceConversation,
  flagWhatsappConversationForTeam,
  getIntegrationsWorkspace,
  findWhatsappConnectionByPhoneNumberId,
  getIntegrationByProvider,
  getIntegration,
  getVoiceWorkspace,
  getVoiceAgent,
  getVoiceConversation,
  getVoiceConversationMessages,
  getWebhookDelivery,
  listDueWebhookDeliveries,
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
  updateWhatsappContactProfile,
  addWhatsappContactTag,
  upsertWhatsappContactAttribute,
  createWhatsappInternalNote,
  updateIntegration,
  updateIntegrationStatus,
  recordIntegrationCheck,
  updateWhatsappDelivery,
  updateWebhookDelivery,
  whatsappEntityBelongsToOrganization,
};

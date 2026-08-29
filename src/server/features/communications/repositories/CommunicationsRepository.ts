import { desc, eq } from "drizzle-orm";
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
      status: input.credentialReference ? "connected" : "disconnected",
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
  createIntegration,
  createVoiceAgent,
  createWhatsappConnection,
  createWhatsappTemplate,
  getIntegrationsWorkspace,
  getVoiceWorkspace,
  getWhatsappWorkspace,
};

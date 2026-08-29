import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { member, organization } from "./better-auth-schema";

const isoNow = sql`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
const createdAt = () => text("created_at").notNull().default(isoNow);

export const organizationModuleEntitlements = pgTable(
  "organization_module_entitlements",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    moduleKey: text("module_key").notNull(),
    status: text("status", { enum: ["enabled", "disabled"] })
      .notNull()
      .default("disabled"),
    enabledAt: text("enabled_at"),
    disabledAt: text("disabled_at"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    uniqueIndex("organization_module_entitlements_org_module_idx").on(
      table.organizationId,
      table.moduleKey,
    ),
  ],
);

export const memberModulePermissions = pgTable(
  "member_module_permissions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    moduleKey: text("module_key").notNull(),
    permission: text("permission", { enum: ["view", "manage", "admin"] })
      .notNull()
      .default("view"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    uniqueIndex("member_module_permissions_member_module_idx").on(
      table.memberId,
      table.moduleKey,
    ),
    index("member_module_permissions_org_idx").on(table.organizationId),
  ],
);

export const crmCompanies = pgTable(
  "crm_companies",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    website: text("website"),
    phone: text("phone"),
    status: text("status").notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    index("crm_companies_org_name_idx").on(table.organizationId, table.name),
  ],
);

export const crmContacts = pgTable(
  "crm_contacts",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    companyId: text("company_id").references(() => crmCompanies.id, {
      onDelete: "set null",
    }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    email: text("email"),
    phone: text("phone"),
    whatsappPhone: text("whatsapp_phone"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    index("crm_contacts_org_name_idx").on(
      table.organizationId,
      table.firstName,
      table.lastName,
    ),
    index("crm_contacts_company_idx").on(table.companyId),
  ],
);

export const crmPipelineStages = pgTable(
  "crm_pipeline_stages",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    stageType: text("stage_type", { enum: ["open", "won", "lost"] })
      .notNull()
      .default("open"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("crm_pipeline_stages_org_position_idx").on(
      table.organizationId,
      table.position,
    ),
  ],
);

export const crmLeads = pgTable(
  "crm_leads",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    contactId: text("contact_id").references(() => crmContacts.id, {
      onDelete: "set null",
    }),
    companyId: text("company_id").references(() => crmCompanies.id, {
      onDelete: "set null",
    }),
    stageId: text("stage_id").references(() => crmPipelineStages.id, {
      onDelete: "set null",
    }),
    assignedMemberId: text("assigned_member_id").references(() => member.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    source: text("source"),
    status: text("status").notNull().default("new"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    index("crm_leads_org_status_idx").on(table.organizationId, table.status),
    index("crm_leads_assignee_idx").on(table.assignedMemberId),
    index("crm_leads_stage_idx").on(table.stageId),
  ],
);

export const crmActivities = pgTable(
  "crm_activities",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    leadId: text("lead_id").references(() => crmLeads.id, {
      onDelete: "cascade",
    }),
    contactId: text("contact_id").references(() => crmContacts.id, {
      onDelete: "cascade",
    }),
    createdByMemberId: text("created_by_member_id").references(
      () => member.id,
      { onDelete: "set null" },
    ),
    activityType: text("activity_type").notNull(),
    subject: text("subject").notNull(),
    notes: text("notes"),
    occurredAt: text("occurred_at").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("crm_activities_org_occurred_idx").on(
      table.organizationId,
      table.occurredAt,
    ),
    index("crm_activities_lead_idx").on(table.leadId),
    index("crm_activities_contact_idx").on(table.contactId),
  ],
);

export const integrationConnections = pgTable(
  "integration_connections",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    providerKey: text("provider_key").notNull(),
    displayName: text("display_name").notNull(),
    status: text("status", { enum: ["connected", "disconnected", "error"] })
      .notNull()
      .default("disconnected"),
    credentialReference: text("credential_reference"),
    lastSyncedAt: text("last_synced_at"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    uniqueIndex("integration_connections_org_provider_idx").on(
      table.organizationId,
      table.providerKey,
    ),
  ],
);

export const whatsappConnections = pgTable(
  "whatsapp_connections",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    displayPhoneNumber: text("display_phone_number"),
    externalAccountId: text("external_account_id"),
    credentialReference: text("credential_reference"),
    status: text("status").notNull().default("disconnected"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [index("whatsapp_connections_org_idx").on(table.organizationId)],
);

export const whatsappConversations = pgTable(
  "whatsapp_conversations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    connectionId: text("connection_id")
      .notNull()
      .references(() => whatsappConnections.id, { onDelete: "cascade" }),
    contactId: text("contact_id").references(() => crmContacts.id, {
      onDelete: "set null",
    }),
    assignedMemberId: text("assigned_member_id").references(() => member.id, {
      onDelete: "set null",
    }),
    externalConversationId: text("external_conversation_id"),
    status: text("status").notNull().default("open"),
    lastMessageAt: text("last_message_at"),
    createdAt: createdAt(),
  },
  (table) => [
    index("whatsapp_conversations_org_updated_idx").on(
      table.organizationId,
      table.lastMessageAt,
    ),
  ],
);

export const whatsappMessages = pgTable(
  "whatsapp_messages",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => whatsappConversations.id, { onDelete: "cascade" }),
    externalMessageId: text("external_message_id"),
    direction: text("direction", { enum: ["inbound", "outbound"] }).notNull(),
    messageType: text("message_type").notNull().default("text"),
    body: text("body"),
    status: text("status").notNull().default("queued"),
    sentAt: text("sent_at"),
    createdAt: createdAt(),
  },
  (table) => [
    index("whatsapp_messages_conversation_created_idx").on(
      table.conversationId,
      table.createdAt,
    ),
  ],
);

export const voiceAgentConfigs = pgTable(
  "voice_agent_configs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    speechToTextProvider: text("speech_to_text_provider"),
    textToSpeechProvider: text("text_to_speech_provider"),
    modelProvider: text("model_provider"),
    credentialReference: text("credential_reference"),
    status: text("status").notNull().default("draft"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [index("voice_agent_configs_org_idx").on(table.organizationId)],
);

export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    direction: text("direction", { enum: ["inbound", "outbound"] }).notNull(),
    url: text("url"),
    secretReference: text("secret_reference"),
    status: text("status").notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [index("webhook_endpoints_org_idx").on(table.organizationId)],
);

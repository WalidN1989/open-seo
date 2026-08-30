/* oxlint-disable max-lines */
import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  boolean,
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

export const businessSettings = pgTable(
  "business_settings",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // Every stored amount is an integer in this currency's smallest unit.
    // Changing it relabels existing figures; it does not convert them.
    currency: text("currency").notNull().default("AUD"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    uniqueIndex("business_settings_org_idx").on(table.organizationId),
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
    industry: text("industry"),
    country: text("country"),
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
    category: text("category"),
    source: text("source"),
    status: text("status").notNull().default("new"),
    priority: text("priority", { enum: ["low", "medium", "high", "urgent"] })
      .notNull()
      .default("medium"),
    valueCents: integer("value_cents").notNull().default(0),
    leadScore: integer("lead_score").notNull().default(0),
    nextAction: text("next_action"),
    nextActionDue: text("next_action_due"),
    notes: text("notes"),
    lostReason: text("lost_reason"),
    lastActivityAt: text("last_activity_at"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    index("crm_leads_org_status_idx").on(table.organizationId, table.status),
    index("crm_leads_assignee_idx").on(table.assignedMemberId),
    index("crm_leads_stage_idx").on(table.stageId),
  ],
);

export const crmSourceRuns = pgTable(
  "crm_source_runs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // Which adapter produced these candidates, and what was asked of it.
    provider: text("provider").notNull(),
    query: text("query").notNull(),
    location: text("location"),
    status: text("status", {
      enum: ["queued", "running", "complete", "error"],
    })
      .notNull()
      .default("queued"),
    error: text("error"),
    candidateCount: integer("candidate_count").notNull().default(0),
    promotedCount: integer("promoted_count").notNull().default(0),
    startedByMemberId: text("started_by_member_id").references(
      () => member.id,
      {
        onDelete: "set null",
      },
    ),
    completedAt: text("completed_at"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    index("crm_source_runs_org_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
  ],
);

export const crmSourceCandidates = pgTable(
  "crm_source_candidates",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    runId: text("run_id")
      .notNull()
      .references(() => crmSourceRuns.id, { onDelete: "cascade" }),
    // The provider's own id for this record. Together with the provider this
    // is what makes re-running a search idempotent rather than duplicating.
    externalId: text("external_id").notNull(),
    provider: text("provider").notNull(),
    companyName: text("company_name").notNull(),
    contactName: text("contact_name"),
    email: text("email"),
    phone: text("phone"),
    website: text("website"),
    category: text("category"),
    country: text("country"),
    industry: text("industry"),
    // What the source thought of it: a rating out of five, how many reviews
    // that came from, and our own 0-100 read of how much to trust the record.
    rating: integer("rating"),
    reviewCount: integer("review_count"),
    evidenceScore: integer("evidence_score").notNull().default(0),
    profileUrl: text("profile_url"),
    notes: text("notes"),
    status: text("status", {
      enum: ["new", "reviewing", "promoted", "rejected"],
    })
      .notNull()
      .default("new"),
    rejectedReason: text("rejected_reason"),
    // Set once promoted, so a candidate can never become two leads.
    leadId: text("lead_id").references(() => crmLeads.id, {
      onDelete: "set null",
    }),
    reviewedByMemberId: text("reviewed_by_member_id").references(
      () => member.id,
      { onDelete: "set null" },
    ),
    reviewedAt: text("reviewed_at"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    index("crm_source_candidates_org_status_idx").on(
      table.organizationId,
      table.status,
    ),
    // The idempotency guarantee: one candidate per provider record per tenant,
    // however many times a search is re-run.
    uniqueIndex("crm_source_candidates_org_provider_external_idx").on(
      table.organizationId,
      table.provider,
      table.externalId,
    ),
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
    outcome: text("outcome"),
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

export const crmInquiries = pgTable(
  "crm_inquiries",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    product: text("product"),
    targetValueCents: integer("target_value_cents").notNull().default(0),
    status: text("status", { enum: ["open", "won", "lost", "archived"] })
      .notNull()
      .default("open"),
    wonLeadId: text("won_lead_id").references(() => crmLeads.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    index("crm_inquiries_org_status_idx").on(
      table.organizationId,
      table.status,
    ),
  ],
);

export const crmInquiryLeads = pgTable(
  "crm_inquiry_leads",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    inquiryId: text("inquiry_id")
      .notNull()
      .references(() => crmInquiries.id, { onDelete: "cascade" }),
    leadId: text("lead_id")
      .notNull()
      .references(() => crmLeads.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("candidate"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("crm_inquiry_leads_inquiry_lead_idx").on(
      table.inquiryId,
      table.leadId,
    ),
    index("crm_inquiry_leads_org_idx").on(table.organizationId),
  ],
);

export const crmMeetings = pgTable(
  "crm_meetings",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    leadId: text("lead_id").references(() => crmLeads.id, {
      onDelete: "set null",
    }),
    assignedMemberId: text("assigned_member_id").references(() => member.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    startsAt: text("starts_at").notNull(),
    endsAt: text("ends_at"),
    location: text("location"),
    meetingUrl: text("meeting_url"),
    status: text("status").notNull().default("scheduled"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    index("crm_meetings_org_starts_idx").on(
      table.organizationId,
      table.startsAt,
    ),
    index("crm_meetings_lead_idx").on(table.leadId),
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
    // Provider credentials, encrypted at rest. A tenant connects their own
    // store from the UI; the environment reference above stays as a fallback
    // for self-hosters who would rather keep secrets on the deployment.
    credentials: text("credentials"),
    // Health is the last real answer the provider gave us, kept so the UI can
    // say when it was checked rather than implying it is checking live.
    lastCheckedAt: text("last_checked_at"),
    healthDetail: text("health_detail"),
    lastSyncedAt: text("last_synced_at"),
    syncStatus: text("sync_status", {
      enum: ["idle", "queued", "running", "error"],
    })
      .notNull()
      .default("idle"),
    syncError: text("sync_error"),
    syncedCount: integer("synced_count").notNull().default(0),
    // Where a paged sync got to. A large catalogue cannot finish inside one
    // request, so a run stops at a page boundary and the next one resumes.
    syncCursor: integer("sync_cursor").notNull().default(0),
    // Later syncs ask only for what changed. That is right for a schedule and
    // wrong for a person pressing the button, who means "fetch it all again" —
    // and it is the only way a new field backfills onto products the store has
    // not touched since.
    fullResync: boolean("full_resync").notNull().default(false),
    autoSync: boolean("auto_sync").notNull().default(true),
    syncIntervalMinutes: integer("sync_interval_minutes").notNull().default(60),
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
    uniqueIndex("whatsapp_conversations_connection_external_idx").on(
      table.connectionId,
      table.externalConversationId,
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
    uniqueIndex("whatsapp_messages_org_external_idx").on(
      table.organizationId,
      table.externalMessageId,
    ),
  ],
);

export const whatsappTemplates = pgTable(
  "whatsapp_templates",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    connectionId: text("connection_id").references(
      () => whatsappConnections.id,
      { onDelete: "cascade" },
    ),
    name: text("name").notNull(),
    languageCode: text("language_code").notNull().default("en"),
    category: text("category").notNull().default("marketing"),
    body: text("body").notNull(),
    externalTemplateId: text("external_template_id"),
    status: text("status").notNull().default("draft"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    uniqueIndex("whatsapp_templates_org_name_language_idx").on(
      table.organizationId,
      table.name,
      table.languageCode,
    ),
  ],
);

export const whatsappCampaigns = pgTable(
  "whatsapp_campaigns",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    connectionId: text("connection_id").references(
      () => whatsappConnections.id,
      { onDelete: "set null" },
    ),
    templateId: text("template_id").references(() => whatsappTemplates.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    status: text("status").notNull().default("draft"),
    scheduledAt: text("scheduled_at"),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    index("whatsapp_campaigns_org_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
  ],
);

export const whatsappAutomationRules = pgTable(
  "whatsapp_automation_rules",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    triggerType: text("trigger_type").notNull(),
    matchValue: text("match_value"),
    responseTemplateId: text("response_template_id").references(
      () => whatsappTemplates.id,
      { onDelete: "set null" },
    ),
    status: text("status").notNull().default("inactive"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    index("whatsapp_automation_rules_org_idx").on(table.organizationId),
  ],
);

export const whatsappOrderRequests = pgTable(
  "whatsapp_order_requests",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").references(
      () => whatsappConversations.id,
      { onDelete: "set null" },
    ),
    contactId: text("contact_id").references(() => crmContacts.id, {
      onDelete: "set null",
    }),
    externalOrderId: text("external_order_id"),
    summary: text("summary").notNull(),
    amountCents: integer("amount_cents").notNull().default(0),
    status: text("status").notNull().default("requested"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    index("whatsapp_order_requests_org_status_idx").on(
      table.organizationId,
      table.status,
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

export const voiceConversations = pgTable(
  "voice_conversations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    agentConfigId: text("agent_config_id")
      .notNull()
      .references(() => voiceAgentConfigs.id, { onDelete: "cascade" }),
    contactId: text("contact_id").references(() => crmContacts.id, {
      onDelete: "set null",
    }),
    channel: text("channel").notNull().default("browser"),
    status: text("status").notNull().default("active"),
    startedAt: text("started_at").notNull(),
    endedAt: text("ended_at"),
    createdAt: createdAt(),
  },
  (table) => [
    index("voice_conversations_org_started_idx").on(
      table.organizationId,
      table.startedAt,
    ),
  ],
);

export const voiceConversationMessages = pgTable(
  "voice_conversation_messages",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => voiceConversations.id, { onDelete: "cascade" }),
    speaker: text("speaker", { enum: ["user", "agent", "system"] }).notNull(),
    transcript: text("transcript").notNull(),
    audioReference: text("audio_reference"),
    createdAt: createdAt(),
  },
  (table) => [
    index("voice_conversation_messages_conversation_idx").on(
      table.conversationId,
      table.createdAt,
    ),
  ],
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

export const webhookSubscriptions = pgTable(
  "webhook_subscriptions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    endpointId: text("endpoint_id")
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("webhook_subscriptions_endpoint_event_idx").on(
      table.endpointId,
      table.eventType,
    ),
  ],
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    endpointId: text("endpoint_id")
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    payloadJson: text("payload_json").notNull().default("{}"),
    status: text("status").notNull().default("pending"),
    responseStatus: integer("response_status"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastAttemptAt: text("last_attempt_at"),
    nextAttemptAt: text("next_attempt_at"),
    errorMessage: text("error_message"),
    responseBody: text("response_body"),
    createdAt: createdAt(),
  },
  (table) => [
    index("webhook_deliveries_org_status_idx").on(
      table.organizationId,
      table.status,
    ),
  ],
);

export const businessAuditEvents = pgTable(
  "business_audit_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    metadataJson: text("metadata_json").notNull().default("{}"),
    createdAt: createdAt(),
  },
  (table) => [
    index("business_audit_events_org_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
    index("business_audit_events_actor_idx").on(table.actorUserId),
  ],
);

/**
 * Commerce: products.
 *
 * Money is stored in integer minor units so arithmetic never touches a float.
 * A variant references its parent explicitly rather than being encoded in JSON,
 * so a variant is queryable and joinable like any other product.
 */
export const commerceProducts = pgTable(
  "commerce_products",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // A variant points at its parent. The callback return type is what lets a
    // table reference itself without a circular initialisation.
    parentProductId: text("parent_product_id").references(
      (): AnyPgColumn => commerceProducts.id,
      { onDelete: "set null" },
    ),
    name: text("name").notNull(),
    sku: text("sku").notNull(),
    barcode: text("barcode"),
    isbn: text("isbn"),
    description: text("description"),
    category: text("category"),
    salePriceMinor: integer("sale_price_minor").notNull().default(0),
    costPriceMinor: integer("cost_price_minor"),
    reorderThreshold: integer("reorder_threshold").notNull().default(0),
    // Where the row came from, so a provider sync updates its own product
    // instead of creating a duplicate on every run.
    // The store's own page for this product. The assistant sends this link
    // to customers, so it is worth keeping even though we never fetch it.
    productUrl: text("product_url"),
    externalSource: text("external_source"),
    externalId: text("external_id"),
    status: text("status", { enum: ["active", "archived"] })
      .notNull()
      .default("active"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    // A SKU identifies a product within one tenant, never across tenants.
    uniqueIndex("commerce_products_org_sku_idx").on(
      table.organizationId,
      table.sku,
    ),
    index("commerce_products_org_status_idx").on(
      table.organizationId,
      table.status,
    ),
    index("commerce_products_org_name_idx").on(
      table.organizationId,
      table.name,
    ),
    index("commerce_products_parent_idx").on(table.parentProductId),
    uniqueIndex("commerce_products_external_idx").on(
      table.organizationId,
      table.externalSource,
      table.externalId,
    ),
  ],
);

/**
 * Commerce: inventory.
 *
 * Stock is not a mutable field on the product. A balance row holds the current
 * quantity and an append-only movement ledger holds how it got there, so a
 * count can always be explained and a mistake is corrected by a compensating
 * movement rather than by editing history.
 */
export const commerceInventoryBalances = pgTable(
  "commerce_inventory_balances",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => commerceProducts.id, { onDelete: "cascade" }),
    quantityOnHand: integer("quantity_on_hand").notNull().default(0),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    // One balance per product per tenant; the ledger carries the history.
    uniqueIndex("commerce_inventory_balances_org_product_idx").on(
      table.organizationId,
      table.productId,
    ),
  ],
);

export const commerceStockMovements = pgTable(
  "commerce_stock_movements",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => commerceProducts.id, { onDelete: "cascade" }),
    movementType: text("movement_type", {
      enum: ["receipt", "sale", "return", "adjustment", "audit"],
    }).notNull(),
    // Signed: negative removes stock. Storing the delta rather than a before
    // and after keeps the ledger append-only and replayable.
    quantityDelta: integer("quantity_delta").notNull(),
    reason: text("reason"),
    // Together these make a movement idempotent: the same source event can be
    // applied once, whatever retries it.
    referenceType: text("reference_type"),
    referenceId: text("reference_id"),
    actorUserId: text("actor_user_id"),
    createdAt: createdAt(),
  },
  (table) => [
    index("commerce_stock_movements_org_product_idx").on(
      table.organizationId,
      table.productId,
      table.createdAt,
    ),
    uniqueIndex("commerce_stock_movements_reference_idx").on(
      table.organizationId,
      table.referenceType,
      table.referenceId,
      table.productId,
    ),
  ],
);

export const commerceInventoryAudits = pgTable(
  "commerce_inventory_audits",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    note: text("note"),
    // A published audit has written its movements; reverting writes
    // compensating ones and never deletes them.
    status: text("status", { enum: ["draft", "published", "reverted"] })
      .notNull()
      .default("draft"),
    createdByUserId: text("created_by_user_id"),
    publishedAt: text("published_at"),
    revertedAt: text("reverted_at"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    index("commerce_inventory_audits_org_status_idx").on(
      table.organizationId,
      table.status,
    ),
  ],
);

export const commerceInventoryAuditItems = pgTable(
  "commerce_inventory_audit_items",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    auditId: text("audit_id")
      .notNull()
      .references(() => commerceInventoryAudits.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => commerceProducts.id, { onDelete: "cascade" }),
    // Captured when the line is added, so a later movement does not silently
    // change what the count was measured against.
    expectedQuantity: integer("expected_quantity").notNull().default(0),
    countedQuantity: integer("counted_quantity").notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("commerce_inventory_audit_items_audit_product_idx").on(
      table.auditId,
      table.productId,
    ),
    index("commerce_inventory_audit_items_org_idx").on(table.organizationId),
  ],
);

/**
 * Commerce: orders.
 *
 * An order belongs to a CRM contact — the contact is the spine, and Orders is
 * the transaction view over it. Payment and fulfilment are separate states
 * because a paid order can be unfulfilled and a fulfilled order unpaid; one
 * combined status cannot express either.
 *
 * Every amount is integer minor units and every total is derived server-side
 * from the lines, never accepted from the caller.
 */
export const commerceOrders = pgTable(
  "commerce_orders",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // Kept when a contact is removed: an order is a financial record and must
    // not disappear because the customer row did.
    contactId: text("contact_id").references(() => crmContacts.id, {
      onDelete: "set null",
    }),
    orderNumber: text("order_number").notNull(),
    status: text("status", {
      enum: ["draft", "confirmed", "cancelled", "returned"],
    })
      .notNull()
      .default("draft"),
    paymentStatus: text("payment_status", {
      enum: ["unpaid", "partial", "paid", "refunded"],
    })
      .notNull()
      .default("unpaid"),
    fulfilmentStatus: text("fulfilment_status", {
      enum: ["unfulfilled", "fulfilled", "returned"],
    })
      .notNull()
      .default("unfulfilled"),
    subtotalMinor: integer("subtotal_minor").notNull().default(0),
    discountMinor: integer("discount_minor").notNull().default(0),
    deliveryMinor: integer("delivery_minor").notNull().default(0),
    taxMinor: integer("tax_minor").notNull().default(0),
    totalMinor: integer("total_minor").notNull().default(0),
    note: text("note"),
    // A provider import is deduplicated on its own stable id, so replaying an
    // import cannot create the same order twice.
    externalSource: text("external_source"),
    externalId: text("external_id"),
    createdByUserId: text("created_by_user_id"),
    confirmedAt: text("confirmed_at"),
    cancelledAt: text("cancelled_at"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    uniqueIndex("commerce_orders_org_number_idx").on(
      table.organizationId,
      table.orderNumber,
    ),
    uniqueIndex("commerce_orders_external_idx").on(
      table.organizationId,
      table.externalSource,
      table.externalId,
    ),
    index("commerce_orders_org_status_idx").on(
      table.organizationId,
      table.status,
    ),
    index("commerce_orders_contact_idx").on(table.contactId),
  ],
);

export const commerceOrderLines = pgTable(
  "commerce_order_lines",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    orderId: text("order_id")
      .notNull()
      .references(() => commerceOrders.id, { onDelete: "cascade" }),
    // Kept when a product is removed, for the same reason as the contact.
    productId: text("product_id").references(() => commerceProducts.id, {
      onDelete: "set null",
    }),
    // Snapshotted at the time of sale: renaming or repricing a product later
    // must not rewrite what was actually sold.
    description: text("description").notNull(),
    sku: text("sku"),
    quantity: integer("quantity").notNull().default(1),
    unitPriceMinor: integer("unit_price_minor").notNull().default(0),
    lineTotalMinor: integer("line_total_minor").notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => [
    index("commerce_order_lines_order_idx").on(table.orderId),
    index("commerce_order_lines_org_idx").on(table.organizationId),
  ],
);

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  businessAuditEvents,
  organization,
  whatsappAssistantSettings,
} from "@/db/schema";
import type { WhatsappAiText } from "@/types/schemas/whatsappAiSettings";

const targetType = "whatsapp_ai_settings";

async function workspace(organizationId: string) {
  const [row] = await db
    .select({ id: organization.id, name: organization.name })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);
  return row ?? null;
}

async function getVersion(organizationId: string, versionId: string) {
  const [row] = await db
    .select()
    .from(businessAuditEvents)
    .where(
      and(
        eq(businessAuditEvents.organizationId, organizationId),
        eq(businessAuditEvents.targetType, targetType),
        eq(businessAuditEvents.targetId, organizationId),
        eq(businessAuditEvents.id, versionId),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function history(organizationId: string, limit: number, offset: number) {
  return db
    .select()
    .from(businessAuditEvents)
    .where(
      and(
        eq(businessAuditEvents.organizationId, organizationId),
        eq(businessAuditEvents.targetType, targetType),
        eq(businessAuditEvents.targetId, organizationId),
      ),
    )
    .orderBy(desc(businessAuditEvents.createdAt), desc(businessAuditEvents.id))
    .limit(limit + 1)
    .offset(offset);
}

/** Back up configured text and change it in the same transaction. */
async function change(input: {
  organizationId: string;
  actorUserId: string;
  before: WhatsappAiText;
  after: WhatsappAiText;
  operation: "update" | "restore";
  expectedResponseMessagesJson: string | null;
  extraValues?: Partial<
    Omit<
      typeof whatsappAssistantSettings.$inferInsert,
      "organizationId" | "createdAt" | "updatedAt"
    >
  >;
  settingsBackup?: Record<string, unknown>;
}) {
  const { organizationId, actorUserId, before, after, operation } = input;
  const { expectedResponseMessagesJson } = input;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const guard = and(
    eq(whatsappAssistantSettings.organizationId, organizationId),
    before.instructions === null
      ? isNull(whatsappAssistantSettings.persona)
      : eq(whatsappAssistantSettings.persona, before.instructions),
    before.handoffMessage === null
      ? isNull(whatsappAssistantSettings.handoffMessage)
      : eq(whatsappAssistantSettings.handoffMessage, before.handoffMessage),
    before.replyStyle === null
      ? isNull(whatsappAssistantSettings.replyStyle)
      : eq(whatsappAssistantSettings.replyStyle, before.replyStyle),
    expectedResponseMessagesJson === null
      ? isNull(whatsappAssistantSettings.responseMessagesJson)
      : eq(
          whatsappAssistantSettings.responseMessagesJson,
          expectedResponseMessagesJson,
        ),
  );
  const ownsEdit = sql`exists (select 1 from ${businessAuditEvents} where ${businessAuditEvents.organizationId} = ${organizationId} and ${businessAuditEvents.id} = ${id})`;
  await runBatch((tx) => [
    // Create defaults only for an explicit write. The upsert locks the existing
    // settings row on Postgres, so a concurrent UI/tool edit cannot pass between
    // the backup guard and the update. D1 batches serialize these statements.
    tx
      .insert(whatsappAssistantSettings)
      .values({ organizationId, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: whatsappAssistantSettings.organizationId,
        set: {
          organizationId: sql`${whatsappAssistantSettings.organizationId}`,
        },
      }),
    tx.insert(businessAuditEvents).select(
      tx
        .select({
          id: sql<string>`${id}`.as("id"),
          organizationId: whatsappAssistantSettings.organizationId,
          actorUserId: sql<string>`${actorUserId}`.as("actorUserId"),
          action:
            sql<string>`${`whatsapp.ai_settings.${operation === "restore" ? "restored" : "updated"}`}`.as(
              "action",
            ),
          targetType: sql<string>`${targetType}`.as("targetType"),
          targetId: whatsappAssistantSettings.organizationId,
          metadataJson:
            sql<string>`${JSON.stringify({ schemaVersion: 1, operation, before, after, ...(input.settingsBackup ? { settingsBackup: input.settingsBackup } : {}) })}`.as(
              "metadataJson",
            ),
          createdAt: sql<string>`${now}`.as("createdAt"),
        })
        .from(whatsappAssistantSettings)
        .where(guard),
    ),
    tx
      .update(whatsappAssistantSettings)
      .set({
        ...input.extraValues,
        persona: after.instructions,
        handoffMessage: after.handoffMessage,
        replyStyle: after.replyStyle,
        responseMessagesJson: after.responseMessages
          ? JSON.stringify(after.responseMessages)
          : null,
        updatedAt: now,
      })
      .where(and(guard, ownsEdit)),
  ]);
  return getVersion(organizationId, id);
}

export const WhatsappAiSettingsRepository = {
  workspace,
  getVersion,
  history,
  change,
};

import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { businessAuditEvents } from "@/db/schema";

async function record(input: {
  organizationId: string;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const [event] = await db
    .insert(businessAuditEvents)
    .values({
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      metadataJson: JSON.stringify(input.metadata ?? {}),
    })
    .returning();
  return event;
}

async function list(organizationId: string, limit = 100) {
  return db
    .select()
    .from(businessAuditEvents)
    .where(eq(businessAuditEvents.organizationId, organizationId))
    .orderBy(desc(businessAuditEvents.createdAt))
    .limit(Math.min(Math.max(limit, 1), 250));
}

export const BusinessAuditRepository = { list, record };

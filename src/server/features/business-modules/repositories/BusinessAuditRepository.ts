import { and, desc, eq, gte, sql } from "drizzle-orm";
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

async function reserveMcpWrite(input: {
  organizationId: string;
  actorUserId: string;
  tokenId: string;
  tool: string;
  projectId?: string | null;
  args: unknown;
}) {
  const id = crypto.randomUUID();
  const [event] = await db
    .insert(businessAuditEvents)
    .values({
      id,
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: `mcp.pending.${input.tool}`,
      targetType: "mcp_tool_call",
      targetId: input.tokenId,
      metadataJson: JSON.stringify({
        token: input.tokenId,
        projectId: input.projectId ?? null,
        before: null,
        after: input.args,
        status: "pending",
      }),
      // SQLite's CURRENT_TIMESTAMP uses a space separator while all MCP
      // windows are ISO strings. Persist one representation on both engines.
      createdAt: new Date().toISOString(),
    })
    .returning();
  return event;
}

async function countRecentMcpWrites(
  organizationId: string,
  tokenId: string,
  since: string,
) {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(businessAuditEvents)
    .where(
      and(
        eq(businessAuditEvents.organizationId, organizationId),
        eq(businessAuditEvents.targetType, "mcp_tool_call"),
        eq(businessAuditEvents.targetId, tokenId),
        gte(businessAuditEvents.createdAt, since),
      ),
    );
  return Number(row?.count ?? 0);
}

async function completeMcpWrite(
  id: string,
  input: {
    organizationId: string;
    action: string;
    tokenId: string;
    projectId?: string | null;
    before: unknown;
    after: unknown;
    targetType?: string;
    targetId?: string | null;
    status: "completed" | "failed" | "rate_limited";
  },
) {
  const [event] = await db
    .update(businessAuditEvents)
    .set({
      organizationId: input.organizationId,
      action: input.action,
      metadataJson: JSON.stringify({
        token: input.tokenId,
        projectId: input.projectId ?? null,
        before: input.before,
        after: input.after,
        targetType: input.targetType ?? "mcp_tool_call",
        targetId: input.targetId ?? null,
        status: input.status,
      }),
    })
    .where(
      and(
        eq(businessAuditEvents.id, id),
        eq(businessAuditEvents.organizationId, input.organizationId),
      ),
    )
    .returning();
  return event ?? null;
}

export const BusinessAuditRepository = {
  completeMcpWrite,
  countRecentMcpWrites,
  list,
  record,
  reserveMcpWrite,
};

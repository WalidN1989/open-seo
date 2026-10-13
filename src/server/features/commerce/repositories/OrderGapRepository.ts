import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import { commerceOrderGapAnnotations, businessAuditEvents } from "@/db/schema";
async function list(organizationId: string) {
  return db
    .select()
    .from(commerceOrderGapAnnotations)
    .where(eq(commerceOrderGapAnnotations.organizationId, organizationId))
    .orderBy(commerceOrderGapAnnotations.orderNumber)
    .limit(1000);
}
async function annotate(
  organizationId: string,
  actorUserId: string,
  orderNumber: string,
  marked: boolean,
) {
  const id = crypto.randomUUID();
  const filter = and(
    eq(commerceOrderGapAnnotations.organizationId, organizationId),
    eq(commerceOrderGapAnnotations.orderNumber, orderNumber),
  );
  const audit = (tx: Parameters<Parameters<typeof runBatch>[0]>[0]) =>
    tx.insert(businessAuditEvents).select(
      tx
        .select({
          id: sql<string>`${crypto.randomUUID()}`.as("id"),
          organizationId: sql<string>`${organizationId}`.as("organizationId"),
          actorUserId: sql<string>`${actorUserId}`.as("actorUserId"),
          action:
            sql<string>`${marked ? "commerce.order_gap.marked" : "commerce.order_gap.restored"}`.as(
              "action",
            ),
          targetType: sql<string>`'order_gap_annotation'`.as("targetType"),
          targetId: sql<string>`${orderNumber}`.as("targetId"),
          metadataJson: sql<string>`'{"sourceOrderChanged":false}'`.as(
            "metadataJson",
          ),
          createdAt: sql<string>`${new Date().toISOString()}`.as("createdAt"),
        })
        .from(commerceOrderGapAnnotations)
        .where(
          and(
            filter,
            marked ? eq(commerceOrderGapAnnotations.id, id) : undefined,
          ),
        ),
    );
  await runBatch((tx) =>
    marked
      ? [
          tx
            .insert(commerceOrderGapAnnotations)
            .values({
              id,
              organizationId,
              orderNumber,
              markedByUserId: actorUserId,
            })
            .onConflictDoNothing(),
          audit(tx),
        ]
      : [audit(tx), tx.delete(commerceOrderGapAnnotations).where(filter)],
  );
}
export const OrderGapRepository = { list, annotate };

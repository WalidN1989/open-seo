import { and, eq, sql, type SQL } from "drizzle-orm";
import type { runBatch } from "@/db/runBatch";
import { invoices, commerceLoyaltyEntries } from "@/db/schema";
import type { shopifyOrderValues } from "../providers/shopifyOrders";

type Executor = Parameters<Parameters<typeof runBatch>[0]>[0];
export function mirroredFinancialStatements(
  tx: Executor,
  organizationId: string,
  orderId: string,
  values: ReturnType<typeof shopifyOrderValues> & { hasRefund: boolean },
  applied: SQL,
) {
  return [
    // Payment changes belong to the same accepted snapshot. Never rewrite the
    // issued basket or turn a void document back into an outstanding invoice.
    tx
      .update(invoices)
      .set({
        paidMinor: sql`case when ${values.paidMinor} > ${invoices.totalMinor} then ${invoices.totalMinor} else ${values.paidMinor} end`,
        status: sql`case when ${values.paidMinor} >= ${invoices.totalMinor} then 'paid' when ${invoices.status} = 'paid' then case when ${invoices.sentAt} is null then 'draft' else 'sent' end else ${invoices.status} end`,
        paidAt: sql`case when ${values.paidMinor} >= ${invoices.totalMinor} then coalesce(${invoices.paidAt}, ${values.externalUpdatedAt}) else null end`,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(invoices.organizationId, organizationId),
          eq(invoices.id, `retail:${orderId}`),
          sql`${invoices.status} <> 'void'`,
          // Refund documents need a separate credit-note workflow; don't describe
          // refunded money as an unpaid customer debt.
          sql`${values.paymentStatus} <> 'refunded'`,
          sql`${values.hasRefund ? 1 : 0} = 0`,
          applied,
        ),
      ),
    ...(values.status === "cancelled" || values.paymentStatus === "refunded"
      ? [
          reverseEarnedPointsStatement(
            tx,
            organizationId,
            orderId,
            applied,
            values.externalUpdatedAt,
          ),
        ]
      : []),
  ];
}

/** Reuse the same per-earned-entry key for cancellation, return and refund retries. */
export function reverseEarnedPointsStatement(
  tx: Executor,
  organizationId: string,
  orderId: string,
  applied: SQL,
  at: string,
) {
  return tx
    .insert(commerceLoyaltyEntries)
    .select(
      tx
        .select({
          id: sql<string>`'reversal:' || ${commerceLoyaltyEntries.id}`.as("id"),
          organizationId: commerceLoyaltyEntries.organizationId,
          contactId: commerceLoyaltyEntries.contactId,
          orderId: commerceLoyaltyEntries.orderId,
          sourceId: sql<string>`'reversal:' || ${commerceLoyaltyEntries.id}`.as(
            "sourceId",
          ),
          kind: sql<"reversed">`'reversed'`.as("kind"),
          points: sql<number>`-${commerceLoyaltyEntries.points}`.as("points"),
          note: sql<string>`'Earned points reversed after order cancellation, return or full refund'`.as(
            "note",
          ),
          createdAt: sql<string>`${at}`.as("createdAt"),
        })
        .from(commerceLoyaltyEntries)
        .where(
          and(
            eq(commerceLoyaltyEntries.organizationId, organizationId),
            eq(commerceLoyaltyEntries.orderId, orderId),
            eq(commerceLoyaltyEntries.kind, "earned"),
            applied,
          ),
        ),
    )
    .onConflictDoNothing();
}

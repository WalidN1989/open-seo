import { and, eq, gte, like, lte } from "drizzle-orm";
import { db } from "@/db";
import { emailMessages } from "@/db/schema";

/** Only app-sent placeholders near this provider timestamp can be reconciled. */
async function pendingMicrosoftSent(
  organizationId: string,
  accountId: string,
  occurredAt: string,
) {
  const time = Date.parse(occurredAt);
  if (!Number.isFinite(time)) return [];
  return db
    .select()
    .from(emailMessages)
    .where(
      and(
        eq(emailMessages.organizationId, organizationId),
        eq(emailMessages.accountId, accountId),
        eq(emailMessages.direction, "outbound"),
        eq(emailMessages.status, "sent"),
        like(emailMessages.externalMessageId, "microsoft-sent:%"),
        gte(emailMessages.occurredAt, new Date(time - 300_000).toISOString()),
        lte(emailMessages.occurredAt, new Date(time + 300_000).toISOString()),
      ),
    )
    .limit(50);
}

export const MicrosoftSentRepository = { pendingMicrosoftSent };

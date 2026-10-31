import { and, asc, desc, eq, gte, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  customerActionRequests as actions,
  voicePhoneCalls as calls,
  whatsappConnections as senders,
  whatsappConversations as chats,
} from "@/db/schema";

async function sender(org: string) {
  const [row] = await db
    .select()
    .from(senders)
    .where(
      and(
        eq(senders.organizationId, org),
        eq(senders.provider, "twilio"),
        eq(senders.status, "connected"),
      ),
    )
    .orderBy(asc(senders.createdAt))
    .limit(1);
  return row ?? null;
}
async function staffChat(org: string, senderId: string, recipient: string) {
  await db
    .insert(chats)
    .values({
      id: crypto.randomUUID(),
      organizationId: org,
      connectionId: senderId,
      externalConversationId: recipient,
      replyMode: "manual",
    })
    .onConflictDoNothing();
  const [chat] = await db
    .select()
    .from(chats)
    .where(
      and(
        eq(chats.organizationId, org),
        eq(chats.connectionId, senderId),
        eq(chats.externalConversationId, recipient),
        isNull(chats.optedOutAt),
      ),
    )
    .limit(1);
  return chat ?? null;
}
async function recentCalls(org: string, caller: string) {
  return db
    .select({ capturedJson: calls.capturedJson })
    .from(calls)
    .where(
      and(
        eq(calls.organizationId, org),
        eq(calls.callerNumber, caller),
        eq(calls.direction, "inbound"),
        gte(calls.createdAt, new Date(Date.now() - 7 * 86400000).toISOString()),
      ),
    )
    .orderBy(desc(calls.createdAt))
    .limit(10);
}
async function pending(org: string, chatId: string) {
  return db
    .select()
    .from(actions)
    .where(
      and(
        eq(actions.organizationId, org),
        eq(actions.whatsappConversationId, chatId),
        eq(actions.kind, "system_voice_staff_alert"),
        eq(actions.status, "pending"),
      ),
    )
    .orderBy(asc(actions.createdAt))
    .limit(12);
}
export const VoiceStaffAlertRepository = {
  sender,
  staffChat,
  recentCalls,
  pending,
};

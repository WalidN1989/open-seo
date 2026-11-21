import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { pushNotificationPreferences, pushSubscriptions } from "@/db/schema";

type SubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
};

async function upsertSubscription(userId: string, input: SubscriptionInput) {
  const now = new Date().toISOString();
  const [row] = await db
    .insert(pushSubscriptions)
    .values({
      id: crypto.randomUUID(),
      userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent,
        updatedAt: now,
        disabledAt: null,
      },
    })
    .returning({ id: pushSubscriptions.id });
  return row ?? null;
}

async function setPreference(
  organizationId: string,
  userId: string,
  enabled: boolean,
) {
  const now = new Date().toISOString();
  const [row] = await db
    .insert(pushNotificationPreferences)
    .values({
      id: crypto.randomUUID(),
      organizationId,
      userId,
      channel: "whatsapp",
      enabled,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        pushNotificationPreferences.organizationId,
        pushNotificationPreferences.userId,
        pushNotificationPreferences.channel,
      ],
      set: { enabled, updatedAt: now },
    })
    .returning({ enabled: pushNotificationPreferences.enabled });
  return row?.enabled ?? false;
}

async function isEnabled(organizationId: string, userId: string) {
  const [row] = await db
    .select({ enabled: pushNotificationPreferences.enabled })
    .from(pushNotificationPreferences)
    .where(
      and(
        eq(pushNotificationPreferences.organizationId, organizationId),
        eq(pushNotificationPreferences.userId, userId),
        eq(pushNotificationPreferences.channel, "whatsapp"),
      ),
    )
    .limit(1);
  return row?.enabled ?? false;
}

async function listEnabledUserIds(organizationId: string) {
  return db
    .select({ userId: pushNotificationPreferences.userId })
    .from(pushNotificationPreferences)
    .where(
      and(
        eq(pushNotificationPreferences.organizationId, organizationId),
        eq(pushNotificationPreferences.channel, "whatsapp"),
        eq(pushNotificationPreferences.enabled, true),
      ),
    );
}

async function listActiveSubscriptions(userId: string) {
  return db
    .select({
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, userId),
        isNull(pushSubscriptions.disabledAt),
      ),
    );
}

async function markSuccess(endpoint: string) {
  await db
    .update(pushSubscriptions)
    .set({ lastSuccessAt: new Date().toISOString() })
    .where(eq(pushSubscriptions.endpoint, endpoint));
}

async function disable(endpoint: string) {
  await db
    .update(pushSubscriptions)
    .set({ disabledAt: new Date().toISOString() })
    .where(eq(pushSubscriptions.endpoint, endpoint));
}

export const PushNotificationRepository = {
  disable,
  isEnabled,
  listActiveSubscriptions,
  listEnabledUserIds,
  markSuccess,
  setPreference,
  upsertSubscription,
};

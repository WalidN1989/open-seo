import { AppError } from "@/server/lib/errors";
import type * as WebPush from "web-push";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { PushNotificationRepository as Repository } from "../repositories/PushNotificationRepository";

type SubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

const PUSH_REQUEST_TIMEOUT_MS = 10_000;
const PUSH_DELIVERY_CONCURRENCY = 10;

type StoredSubscription = Awaited<
  ReturnType<typeof Repository.listActiveSubscriptions>
>[number];
type SendNotification = typeof WebPush.sendNotification;

async function configuration() {
  const [publicKey, privateKey, subject, applicationUrl] = await Promise.all([
    getOptionalEnvValue("WEB_PUSH_VAPID_PUBLIC_KEY"),
    getOptionalEnvValue("WEB_PUSH_VAPID_PRIVATE_KEY"),
    getOptionalEnvValue("WEB_PUSH_VAPID_SUBJECT"),
    getOptionalEnvValue("BETTER_AUTH_URL"),
  ]);
  return {
    publicKey,
    privateKey,
    subject: subject ?? applicationUrl,
  };
}

async function status(organizationId: string, userId: string) {
  const [config, access, enabled, projects] = await Promise.all([
    configuration(),
    BusinessModuleService.getAccess(organizationId, userId),
    Repository.isEnabled(organizationId, userId),
    ProjectRepository.listProjects(organizationId),
  ]);
  const whatsapp = access.find((item) => item.key === "whatsapp");
  const project = projects[0] ?? null;
  const configured = Boolean(
    config.publicKey && config.privateKey && config.subject,
  );
  return {
    configured,
    eligible: Boolean(whatsapp?.enabled && whatsapp.permission),
    enabled,
    publicKey: configured ? (config.publicKey ?? null) : null,
    workspaceName: project?.name ?? "this workspace",
  };
}

async function subscribe(
  organizationId: string,
  userId: string,
  input: SubscriptionInput,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "whatsapp",
    "view",
  );
  const config = await configuration();
  if (!config.publicKey || !config.privateKey || !config.subject) {
    throw new AppError(
      "CONFLICT",
      "Push notifications are not configured for this installation.",
    );
  }
  await Repository.upsertSubscription(userId, input);
  await Repository.setPreference(organizationId, userId, true);
  return { enabled: true };
}

async function setPreference(
  organizationId: string,
  userId: string,
  enabled: boolean,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "whatsapp",
    "view",
  );
  return {
    enabled: await Repository.setPreference(organizationId, userId, enabled),
  };
}

function errorStatus(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const value: unknown = "statusCode" in error ? error.statusCode : null;
  return typeof value === "number" ? value : null;
}

async function sendOne(
  subscription: StoredSubscription,
  payload: string,
  config: {
    publicKey: string;
    privateKey: string;
    subject: string;
  },
  sendNotification: SendNotification,
) {
  try {
    await sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      payload,
      {
        TTL: 60 * 60,
        urgency: "high",
        vapidDetails: config,
        timeout: PUSH_REQUEST_TIMEOUT_MS,
      },
    );
  } catch (error) {
    const statusCode = errorStatus(error);
    if (statusCode === 404 || statusCode === 410) {
      await Repository.disable(subscription.endpoint);
    }
    console.warn("Web Push delivery failed", { statusCode });
  }
}

async function sendAll(
  subscriptions: StoredSubscription[],
  payload: string,
  vapidDetails: { publicKey: string; privateKey: string; subject: string },
) {
  if (subscriptions.length === 0) return;
  const { sendNotification } = await import("web-push");
  for (
    let index = 0;
    index < subscriptions.length;
    index += PUSH_DELIVERY_CONCURRENCY
  ) {
    await Promise.all(
      subscriptions
        .slice(index, index + PUSH_DELIVERY_CONCURRENCY)
        .map((subscription) =>
          sendOne(subscription, payload, vapidDetails, sendNotification),
        ),
    );
  }
}

/** Best-effort and privacy-minimal: never fail or delay provider acknowledgement. */
async function notifyWhatsappInbound(input: {
  organizationId: string;
  conversationId: string;
  externalMessageId: string;
}) {
  const config = await configuration();
  if (!config.publicKey || !config.privateKey || !config.subject) return;
  const vapidDetails = {
    publicKey: config.publicKey,
    privateKey: config.privateKey,
    subject: config.subject,
  };

  const [preferences, projects] = await Promise.all([
    Repository.listEnabledUserIds(input.organizationId),
    ProjectRepository.listProjects(input.organizationId),
  ]);
  const project = projects[0] ?? null;
  if (!project || preferences.length === 0) return;
  const address = project.slug ?? project.id;
  const url = `/p/${encodeURIComponent(address)}/modules/whatsapp?conversation=${encodeURIComponent(input.conversationId)}`;
  const payload = JSON.stringify({
    title: `New WhatsApp message · ${project.name}`,
    body: "Open Digital Urgency to view and reply.",
    url,
    tag: `whatsapp:${input.externalMessageId}`,
  });

  const subscriptions: StoredSubscription[] = [];
  for (const preference of preferences) {
    try {
      await BusinessModuleService.requireAccess(
        input.organizationId,
        preference.userId,
        "whatsapp",
        "view",
      );
      subscriptions.push(
        ...(await Repository.listActiveSubscriptions(preference.userId)),
      );
    } catch {
      // Access changed after opt-in. The stale preference remains harmless.
    }
  }
  await sendAll(subscriptions, payload, vapidDetails);
}

export const PushNotificationService = {
  notifyWhatsappInbound,
  setPreference,
  status,
  subscribe,
};

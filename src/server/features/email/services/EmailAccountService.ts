import type { z } from "zod";
import { AppError } from "@/server/lib/errors";
import { encryptCredentials } from "@/server/lib/connection-secrets";
import { getRequiredEnvValue } from "@/server/lib/runtime-env";
import { BusinessAuditRepository } from "@/server/features/business-modules/repositories/BusinessAuditRepository";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import type { connectAgentmailSchema } from "@/types/schemas/email";
import {
  AgentmailError,
  POD_KEY_PERMISSIONS,
  WEBHOOK_EVENT_TYPES,
  agentmailClient,
} from "../providers/agentmail";
import {
  EmailRepository as Repo,
  type EmailAccountRow,
} from "../repositories/EmailRepository";

const MODULE = "email" as const;

export async function audit(
  organizationId: string,
  userId: string,
  action: string,
  targetId: string,
  metadata?: Record<string, unknown>,
) {
  await BusinessAuditRepository.record({
    organizationId,
    actorUserId: userId,
    action,
    targetType: "email",
    targetId,
    metadata,
  });
}

/** The account as the browser may see it: everything but the secrets. */
export function publicAccount(account: EmailAccountRow | null) {
  if (!account) return null;
  const { credentials, ...rest } = account;
  return { ...rest, hasCredentials: Boolean(credentials) };
}

export function providerFailure(error: unknown): never {
  if (error instanceof AgentmailError) {
    throw new AppError("INTEGRATION_CHECK_FAILED", explain(error));
  }
  throw error;
}

/** Turn the provider's status into the thing the operator can actually do. */
function explain(error: AgentmailError): string {
  if (error.status === 403 && error.path === "/pods") {
    return "AgentMail refused to create a pod with this key. Use an organisation-level key with full permissions (create it under console.agentmail.to → API keys without choosing a pod or inbox), or check that your AgentMail plan includes pods.";
  }
  if (error.status === 401) {
    return "AgentMail did not accept this key. Copy it again from console.agentmail.to → API keys.";
  }
  return error.message;
}

/**
 * One pod per organisation, keyed by client_id. A previous attempt may have
 * created the pod and failed later, so look before creating: a second pod
 * would strand the first and split the business's inboxes.
 */
async function findOrCreatePod(
  client: ReturnType<typeof agentmailClient>,
  name: string,
  organizationId: string,
) {
  const clientId = `openseo-${organizationId}`;
  let pageToken: string | undefined;
  for (let page = 0; page < 5; page += 1) {
    const listed = await client.listPods(pageToken);
    const found = listed.pods?.find((pod) => pod.client_id === clientId);
    if (found) return found;
    if (!listed.next_page_token) break;
    pageToken = listed.next_page_token;
  }
  return client.createPod({ name, client_id: clientId });
}

/**
 * Turn the operator's organisation-level AgentMail key into a pod, an inbox
 * in that pod, a pod-scoped key, and a webhook for the inbox. Only the
 * pod-scoped key and the webhook secret are stored; the organisation key is
 * discarded when this returns.
 */
async function connectAgentmail(
  organizationId: string,
  userId: string,
  input: z.infer<typeof connectAgentmailSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    MODULE,
    "admin",
  );
  const existing = await Repo.getAccount(organizationId);
  if (existing?.status === "connected") {
    throw new AppError(
      "CONFLICT",
      "This business already has an email account. Disconnect it first.",
    );
  }
  const client = agentmailClient(input.apiKey);
  const projectName =
    (await Repo.projectNameFor(organizationId)) ?? input.displayName;
  const baseUrl = (await getRequiredEnvValue("BETTER_AUTH_URL")).replace(
    /\/$/,
    "",
  );

  let account: EmailAccountRow | null = null;
  try {
    const pod = await findOrCreatePod(client, projectName, organizationId);
    const inbox = await client.createPodInbox(pod.pod_id, {
      username: input.username,
      display_name: input.displayName,
      client_id: `openseo-${organizationId}-inbox`,
    });
    const podKey = await client.createPodApiKey(pod.pod_id, {
      name: `OpenSEO · ${projectName}`,
      permissions: POD_KEY_PERMISSIONS,
    });
    account = existing
      ? await Repo.updateAccount(existing.id, {
          status: "pending",
          lastError: null,
        })
      : null;
    account ??= await Repo.createAccount({
      organizationId,
      provider: "agentmail",
      displayName: input.displayName,
      address: inbox.email,
      podId: pod.pod_id,
      inboxId: inbox.inbox_id,
    });
    const webhook = await client.createWebhook({
      url: `${baseUrl}/api/email/${account.id}`,
      event_types: WEBHOOK_EVENT_TYPES,
      inbox_ids: [inbox.inbox_id],
      client_id: `openseo-${account.id}`,
    });
    const credentials = await encryptCredentials({
      API_KEY: podKey.api_key,
      WEBHOOK_SECRET: webhook.secret,
    });
    const connected = await Repo.updateAccount(account.id, {
      webhookId: webhook.webhook_id,
      credentials,
      status: "connected",
      lastError: null,
    });
    await audit(organizationId, userId, "email.account.connected", account.id, {
      provider: "agentmail",
      address: inbox.email,
    });
    return publicAccount(connected);
  } catch (error) {
    if (account) {
      await Repo.updateAccount(account.id, {
        status: "error",
        lastError: error instanceof Error ? error.message : "Connection failed",
      });
    }
    providerFailure(error);
  }
}

async function disconnect(organizationId: string, userId: string) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    MODULE,
    "admin",
  );
  const account = await Repo.getAccount(organizationId);
  if (!account) throw new AppError("NOT_FOUND", "No email account.");
  // The mirrored threads stay; only the ability to send and receive goes.
  const updated = await Repo.updateAccount(account.id, {
    status: "disconnected",
    credentials: null,
  });
  await audit(organizationId, userId, "email.account.disconnected", account.id);
  return publicAccount(updated);
}

async function setAutopilot(
  organizationId: string,
  userId: string,
  autopilot: boolean,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    MODULE,
    "manage",
  );
  const account = await Repo.getAccount(organizationId);
  if (!account) throw new AppError("NOT_FOUND", "No email account.");
  const updated = await Repo.updateAccount(account.id, { autopilot });
  await audit(organizationId, userId, "email.autopilot.changed", account.id, {
    autopilot,
  });
  return publicAccount(updated);
}

export const EmailAccountService = {
  connectAgentmail,
  disconnect,
  setAutopilot,
};

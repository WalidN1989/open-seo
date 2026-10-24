import { BusinessAuditRepository } from "@/server/features/business-modules/repositories/BusinessAuditRepository";
import { getRequiredEnvValue } from "@/server/lib/runtime-env";
import { z } from "zod";
import { CallBookLinkRepository as Repo } from "../repositories/CallBookLinkRepository";
import { PhoneCallRepository } from "../repositories/PhoneCallRepository";
import { BusinessModuleRepository } from "@/server/features/business-modules/repositories/BusinessModuleRepository";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { fetchCallBookLinkTemplate } from "@/server/features/communications/providers/twilioContent";
import { sendWhatsappTemplate } from "@/server/features/communications/providers/whatsapp";
import { orderPhone } from "@/server/features/commerce/providers/shopifyOrders";
import type { voiceBookLinkSettingsSchema } from "@/types/schemas/voiceBookLinks";
import { AppError } from "@/server/lib/errors";
async function access(org: string, user: string, connectionId: string) {
  for (const key of ["voice", "whatsapp", "integrations"] as const)
    await BusinessModuleService.requireAccess(org, user, key, "manage");
  await BusinessModuleService.requireAccess(org, user, "crm");
  const connection = await PhoneCallRepository.getIntegrationById(connectionId);
  if (
    !connection ||
    connection.organizationId !== org ||
    connection.providerKey !== "elevenlabs" ||
    connection.status !== "connected"
  )
    throw new AppError("NOT_FOUND");
}
async function settings(org: string, user: string, connectionId: string) {
  await access(org, user, connectionId);
  return (
    (await Repo.configuration(org, connectionId)) ?? {
      connectionId,
      enabled: false,
      senderId: null,
      contentSid: null,
      startedAt: null,
    }
  );
}
async function configure(
  org: string,
  user: string,
  input: z.infer<typeof voiceBookLinkSettingsSchema>,
) {
  await access(org, user, input.connectionId);
  if (input.enabled) {
    const sender = await Repo.sender(org, input.senderId ?? "");
    if (
      !sender ||
      sender.provider !== "twilio" ||
      sender.status !== "connected" ||
      !input.contentSid
    )
      throw new AppError(
        "VALIDATION_ERROR",
        "Choose the connected Twilio sender and approved book-link template.",
      );
    const current = await fetchCallBookLinkTemplate(sender, input.contentSid);
    if (current.status !== "approved")
      throw new AppError(
        "VALIDATION_ERROR",
        "The book-link template is not currently approved.",
      );
  }
  const previous = await Repo.configuration(org, input.connectionId);
  await Repo.configure({
    ...input,
    organizationId: org,
    startedAt: input.enabled
      ? previous?.enabled
        ? previous.startedAt
        : new Date().toISOString()
      : (previous?.startedAt ?? null),
  });
  await BusinessAuditRepository.record({
    organizationId: org,
    actorUserId: user,
    action: "voice.book_links.configured",
    targetType: "integration_connection",
    targetId: input.connectionId,
    metadata: {
      enabled: input.enabled,
      senderId: input.senderId,
      contentSid: input.contentSid,
    },
  });
}
async function modulesEnabled(org: string) {
  const modules = await BusinessModuleRepository.listEntitlements(org);
  return ["voice", "whatsapp", "integrations", "crm"].every((key) =>
    modules.some((m) => m.moduleKey === key && m.status === "enabled"),
  );
}
async function prepareBookLink(
  org: string,
  connectionId: string,
  call: NonNullable<Awaited<ReturnType<typeof Repo.call>>>,
  config: NonNullable<Awaited<ReturnType<typeof Repo.configuration>>>,
) {
  const connection = await PhoneCallRepository.getIntegrationById(connectionId);
  if (
    connection?.organizationId !== org ||
    connection.providerKey !== "elevenlabs" ||
    connection.status !== "connected" ||
    !(await modulesEnabled(org))
  )
    return "skipped: connection or module unavailable";
  let capturedValue: unknown;
  try {
    capturedValue = JSON.parse(call.capturedJson);
  } catch {
    return "skipped: invalid call data";
  }
  const captured = z.record(z.string(), z.string()).safeParse(capturedValue);
  if (
    !captured.success ||
    captured.data.whatsapp_link_consent?.trim().toLowerCase() !== "true"
  )
    return "skipped: no explicit book-link consent";
  const c = captured.data;
  const preference = c.whatsapp_preference?.trim().toLowerCase();
  const recipient =
    preference === "same number"
      ? orderPhone(call.callerNumber)
      : preference === "different number"
        ? orderPhone(c.whatsapp_number)
        : null;
  if (!recipient) return "skipped: WhatsApp destination not confirmed";
  const url = z.url({ protocol: /^https$/ }).safeParse(c.requested_product_url);
  if (!url.success || new URL(url.data).username || new URL(url.data).password)
    return "skipped: invalid product link";
  const product = await Repo.product(org, url.data);
  if (!product) return "skipped: product link is not in the active catalogue";
  const sender = await Repo.sender(org, config.senderId ?? "");
  if (
    !sender ||
    sender.provider !== "twilio" ||
    sender.status !== "connected" ||
    !config.contentSid
  )
    return "skipped: no connected Twilio sender";
  let template: Awaited<ReturnType<typeof fetchCallBookLinkTemplate>>;
  try {
    template = await fetchCallBookLinkTemplate(sender, config.contentSid);
    if (template.status !== "approved")
      return "skipped: template is not approved";
  } catch {
    return "skipped: template approval could not be checked";
  }
  let appUrl: URL;
  try {
    appUrl = new URL(await getRequiredEnvValue("BETTER_AUTH_URL"));
  } catch {
    return "skipped: secure delivery callback unavailable";
  }
  if (appUrl.protocol !== "https:" || appUrl.username || appUrl.password)
    return "skipped: secure delivery callback unavailable";
  const statusCallbackUrl = new URL(
    `/api/whatsapp/${encodeURIComponent(sender.id)}`,
    appUrl.origin,
  ).href;
  const name = c.caller_name?.trim().slice(0, 100) || "there";
  const variables = { "1": name, "2": product.productUrl ?? url.data };
  const body = template.body.replace(
    /\{\{\s*([12])\s*\}\}/g,
    (_m, k: "1" | "2") => variables[k],
  );
  return {
    sender,
    template,
    recipient,
    variables,
    body,
    statusCallbackUrl,
    contentSid: config.contentSid,
  };
}

async function send(
  org: string,
  connectionId: string,
  callId: string,
  manual = false,
) {
  const call = await Repo.call(org, callId);
  if (
    !call ||
    call.integrationId !== connectionId ||
    call.provider !== "elevenlabs"
  )
    return "skipped: unknown call";
  const existing = await Repo.message(org, callId);
  if (existing) {
    await Repo.linkMessage(org, callId, existing.id);
    return existing.status;
  }
  const skip = async (value: string) => {
    await Repo.status(org, callId, value);
    return value;
  };
  const config = await Repo.configuration(org, connectionId);
  if (!config?.enabled || !config.startedAt)
    return skip("skipped: book-link follow-up is off");
  if (
    !manual &&
    (!call.startedAt ||
      !Number.isFinite(Date.parse(call.startedAt)) ||
      !Number.isFinite(Date.parse(config.startedAt)) ||
      Date.parse(call.startedAt) < Date.parse(config.startedAt))
  )
    return skip("skipped: call predates activation");
  const prepared = await prepareBookLink(org, connectionId, call, config);
  if (typeof prepared === "string") return skip(prepared);
  const {
    sender,
    template,
    recipient,
    variables,
    body,
    statusCallbackUrl,
    contentSid,
  } = prepared;
  const claimed = await Repo.reserve({
    organizationId: org,
    callId,
    senderId: sender.id,
    recipient,
    contactId: call.contactId,
    body,
  });
  if (!claimed)
    return (
      (await Repo.message(org, callId))?.status ??
      skip("skipped: recipient opted out")
    );
  await Repo.linkMessage(org, callId, claimed.id);
  try {
    const latest = await Repo.configuration(org, connectionId);
    const currentSender = await Repo.sender(org, sender.id);
    const currentConnection =
      await PhoneCallRepository.getIntegrationById(connectionId);
    if (
      !latest?.enabled ||
      latest.senderId !== config.senderId ||
      latest.contentSid !== config.contentSid ||
      latest.startedAt !== config.startedAt ||
      currentConnection?.organizationId !== org ||
      currentConnection.status !== "connected" ||
      !(await modulesEnabled(org)) ||
      currentSender?.status !== "connected" ||
      currentSender.credentials !== sender.credentials ||
      currentSender.credentialReference !== sender.credentialReference ||
      currentSender.externalAccountId !== sender.externalAccountId ||
      currentSender.displayPhoneNumber !== sender.displayPhoneNumber ||
      !(await Repo.canSend(org, claimed.conversationId))
    ) {
      await Repo.complete(org, claimed.id, { status: "failed" });
      return skip("skipped: follow-up settings changed or recipient opted out");
    }
    const sent = await sendWhatsappTemplate(
      sender,
      recipient,
      {
        name: "voice_call_followup",
        languageCode: template.languageCode,
        externalTemplateId: contentSid,
        variables,
        statusCallbackUrl,
      },
      (input, init) =>
        fetch(input, {
          ...init,
          redirect: "manual",
          signal: AbortSignal.timeout(10000),
        }),
    );
    await Repo.complete(org, claimed.id, {
      externalMessageId: sent.externalMessageId,
      status: sent.status,
      sentAt: new Date().toISOString(),
    });
    await Repo.status(org, callId, sent.status);
    return sent.status;
  } catch {
    await Repo.complete(org, claimed.id, { status: "unknown" });
    await Repo.status(
      org,
      callId,
      "unknown: send outcome uncertain; do not resend",
    );
    return "unknown: send outcome uncertain; do not resend";
  }
}
async function sendManually(org: string, user: string, callId: string) {
  const call = await Repo.call(org, callId);
  if (!call?.integrationId) throw new AppError("NOT_FOUND");
  await access(org, user, call.integrationId);
  const result = await send(org, call.integrationId, callId, true);
  await BusinessAuditRepository.record({
    organizationId: org,
    actorUserId: user,
    action: "voice.book_link.manual_requested",
    targetType: "phone_call",
    targetId: callId,
    metadata: { status: result },
  });
  return result;
}
export const CallBookLinkService = { settings, configure, send, sendManually };

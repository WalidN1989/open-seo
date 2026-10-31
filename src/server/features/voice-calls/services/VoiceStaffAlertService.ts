import { z } from "zod";
import { getRequiredEnvValue } from "@/server/lib/runtime-env";
import type { PhoneCallReport } from "../elevenlabsWebhook";
import { VoiceStaffAlertRepository as Repo } from "../repositories/VoiceStaffAlertRepository";
import { ActionRepository as Actions } from "@/server/features/customer-workflow/repositories/ActionRepository";
import { BusinessModuleRepository } from "@/server/features/business-modules/repositories/BusinessModuleRepository";
import { WhatsappHandoffRepository as Staff } from "@/server/features/communications/repositories/WhatsappHandoffRepository";
import { WhatsappHandoffOutboxRepository as Outbox } from "@/server/features/communications/repositories/WhatsappHandoffOutboxRepository";
import { CommunicationsRepository } from "@/server/features/communications/repositories/CommunicationsRepository";
import { WhatsappAssistantRepository } from "@/server/features/communications/repositories/WhatsappAssistantRepository";
import {
  sendWhatsappText,
  sendWhatsappTemplate,
} from "@/server/features/communications/providers/whatsapp";
import { fetchHandoffTemplate } from "@/server/features/communications/providers/twilioContent";
import { evaluateWhatsappWindow } from "@/server/features/communications/whatsappWindow";
import { orderPhone } from "@/server/features/commerce/providers/shopifyOrders";

const capturedSchema = z.object({ inquiry_type: z.string().optional() });
const commandSchema = z.object({
  body: z.string().max(1200),
  caller: z.string(),
  reason: z.string().max(600),
});
const fetcher: typeof fetch = (input, init) =>
  fetch(input, {
    ...init,
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
  });

async function modulesEnabled(org: string) {
  const modules = await BusinessModuleRepository.listEntitlements(org);
  return ["voice", "whatsapp"].every((key) =>
    modules.some((m) => m.moduleKey === key && m.status === "enabled"),
  );
}

/** Destinations come only from private staff settings, never the model or caller. */
async function dispatch(org: string, chatId: string) {
  if (!(await modulesEnabled(org))) return;
  for (const action of await Repo.pending(org, chatId)) {
    const route = await CommunicationsRepository.getWhatsappConversationForSend(
      org,
      chatId,
    );
    if (
      !route ||
      route.connection.status !== "connected" ||
      route.connection.provider !== "twilio" ||
      route.conversation.optedOutAt
    )
      return;
    const recipient = orderPhone(route.conversation.externalConversationId);
    const staff = await Staff.listContacts(org);
    if (
      !recipient ||
      recipient === orderPhone(route.connection.displayPhoneNumber) ||
      !staff.some((s) => orderPhone(s.phone) === recipient)
    )
      return;
    let value: unknown;
    try {
      value = JSON.parse(action.requestJson);
    } catch {
      continue;
    }
    const command = commandSchema.safeParse(value);
    if (!command.success) continue;
    const appUrl = new URL(await getRequiredEnvValue("BETTER_AUTH_URL"));
    if (appUrl.protocol !== "https:" || appUrl.username || appUrl.password)
      continue;
    const statusCallbackUrl = new URL(
      `/api/whatsapp/${encodeURIComponent(route.connection.id)}`,
      appUrl.origin,
    ).href;
    const window = evaluateWhatsappWindow(
      await Outbox.lastInboundAt(org, route.connection.id, recipient),
    );
    let template;
    if (!window.windowOpen) {
      const settings = await WhatsappAssistantRepository.getSettings(org);
      if (!settings?.handoffContentSid) continue;
      try {
        template = await fetchHandoffTemplate(
          route.connection,
          settings.handoffContentSid,
        );
      } catch {
        continue;
      }
    }
    const claimed = await Actions.transition(org, action.id, ["pending"], {
      status: "sending",
    });
    if (!claimed) continue;
    try {
      const [currentRoute, currentStaff, currentSettings] = await Promise.all([
        CommunicationsRepository.getWhatsappConversationForSend(org, chatId),
        Staff.listContacts(org),
        template
          ? WhatsappAssistantRepository.getSettings(org)
          : Promise.resolve(null),
      ]);
      if (
        !currentRoute ||
        currentRoute.conversation.optedOutAt ||
        currentRoute.connection.status !== "connected" ||
        currentRoute.connection.credentials !== route.connection.credentials ||
        currentRoute.connection.credentialReference !==
          route.connection.credentialReference ||
        currentRoute.connection.externalAccountId !==
          route.connection.externalAccountId ||
        currentRoute.connection.displayPhoneNumber !==
          route.connection.displayPhoneNumber ||
        orderPhone(currentRoute.conversation.externalConversationId) !==
          recipient ||
        !currentStaff.some((s) => orderPhone(s.phone) === recipient) ||
        (template &&
          currentSettings?.handoffContentSid !== template.externalTemplateId) ||
        !(await modulesEnabled(org))
      ) {
        await Actions.finish(org, action.id, {
          status: "attention",
          error:
            "Staff destination, sender or module changed before dispatch; nothing sent.",
        });
        continue;
      }
      if (
        !template &&
        !evaluateWhatsappWindow(
          await Outbox.lastInboundAt(
            org,
            currentRoute.connection.id,
            recipient,
          ),
        ).windowOpen
      ) {
        await Actions.finish(org, action.id, { status: "pending" });
        continue;
      }
      // No retry after provider I/O: an uncertain acceptance must not duplicate an alert.
      const result = template
        ? await sendWhatsappTemplate(
            route.connection,
            recipient,
            {
              ...template,
              statusCallbackUrl,
              variables: {
                "1": command.data.caller,
                "2": command.data.reason,
                "3": "Voice call: review in DU",
              },
            },
            fetcher,
          )
        : await sendWhatsappText(
            route.connection,
            recipient,
            command.data.body,
            fetcher,
            { statusCallbackUrl },
          );
      await CommunicationsRepository.recordAutomatedWhatsapp(route.connection, {
        recipient,
        contactId: null,
        body: command.data.body,
        externalMessageId: result.externalMessageId,
        status: result.status,
        sentAt: new Date().toISOString(),
      });
      await Actions.finish(org, action.id, {
        status: ["failed", "undelivered"].includes(result.status)
          ? "attention"
          : "completed",
        resultJson: JSON.stringify(result),
        error: null,
      });
    } catch {
      await Actions.finish(org, action.id, {
        status: "attention",
        error:
          "Staff alert delivery uncertain; check provider history before resending.",
      });
    }
  }
}

async function afterCall(org: string, callId: string, report: PhoneCallReport) {
  if (
    report.direction !== "inbound" ||
    !Object.hasOwn(report.captured, "staff_handoff_required") ||
    !(await modulesEnabled(org))
  )
    return;
  let reason = report.captured.staff_handoff_reason?.trim() ?? "";
  if (report.captured.staff_handoff_required !== "true") reason = "";
  if (
    !reason &&
    report.captured.staff_handoff_required !== "false" &&
    report.captured.inquiry_type === "order_tracking" &&
    report.callerNumber
  ) {
    const recent = await Repo.recentCalls(org, report.callerNumber);
    const orders = recent.filter((row) => {
      try {
        const parsed = capturedSchema.safeParse(JSON.parse(row.capturedJson));
        return parsed.success && parsed.data.inquiry_type === "order_tracking";
      } catch {
        return false;
      }
    });
    if (orders.length >= 2)
      reason =
        "Repeated order-tracking calls within seven days; please check whether the customer still needs help.";
  }
  if (!reason) return;
  const staff = await Staff.listContacts(org);
  if (!staff.length) return;
  const sender = await Repo.sender(org);
  if (!sender) return;
  const caller = report.callerNumber || "Unknown caller";
  reason = `${reason} ${report.summary ?? ""}`.trim().slice(0, 600);
  const body = `Voice customer issue — ${caller}\n${reason}\nPlease review the call in DU and follow up with the customer.`;
  for (const contact of staff) {
    const recipient = orderPhone(contact.phone);
    if (
      !recipient ||
      recipient === orderPhone(sender.displayPhoneNumber) ||
      recipient === orderPhone(caller)
    )
      continue;
    const chat = await Repo.staffChat(org, sender.id, recipient);
    if (!chat) continue;
    const at = new Date().toISOString();
    await Actions.ensure({
      id: `voice-staff:${callId}:${chat.id}`,
      organizationId: org,
      callId,
      whatsappConversationId: chat.id,
      kind: "system_voice_staff_alert",
      status: "pending",
      requestJson: JSON.stringify({ body, caller, reason }),
      requestedByUserId: "system:post-call",
      createdAt: at,
      updatedAt: at,
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    });
    await dispatch(org, chat.id);
  }
}

/** A staff reply opens their own 24-hour window; it never becomes a customer enquiry. */
async function staffInbound(org: string, chatId: string, from: string) {
  const recipient = orderPhone(from);
  if (
    !recipient ||
    !(await Staff.listContacts(org)).some(
      (s) => orderPhone(s.phone) === recipient,
    )
  )
    return false;
  await CommunicationsRepository.updateWhatsappConversation(org, {
    conversationId: chatId,
    replyMode: "manual",
  });
  await dispatch(org, chatId);
  return true;
}
export const VoiceStaffAlertService = { afterCall, staffInbound };

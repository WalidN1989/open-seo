import { WhatsappHandoffOutboxRepository as Outbox } from "../repositories/WhatsappHandoffOutboxRepository";
import { getRequiredEnvValue } from "@/server/lib/runtime-env";
import type { z } from "zod";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { BusinessAuditRepository } from "@/server/features/business-modules/repositories/BusinessAuditRepository";
import {
  handoffInputSchema,
  type handoffSettingsSchema,
} from "@/types/schemas/whatsappHandoff";
import { WhatsappHandoffRepository as Repo } from "../repositories/WhatsappHandoffRepository";
import { CommunicationsRepository } from "../repositories/CommunicationsRepository";
import { WhatsappAssistantRepository } from "../repositories/WhatsappAssistantRepository";
import { fetchHandoffTemplate } from "../providers/twilioContent";
import { sendWhatsappText, sendWhatsappTemplate } from "../providers/whatsapp";
import { evaluateWhatsappWindow } from "../whatsappWindow";
import { wakeWhatsappReply } from "./WhatsappReplyWakeupService";

const HANDOFF_ACKNOWLEDGEMENT =
  "I've saved your request for a person to review. I'll pause automated replies here so the team can take over.";
const phone = (value: string | null) =>
  value ? "+" + value.replace(/^whatsapp:/, "").replace(/\D/g, "") : null;

async function settings(organizationId: string, userId: string) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "whatsapp",
    "admin",
  );
  const [contacts, config] = await Promise.all([
    Repo.listContacts(organizationId),
    WhatsappAssistantRepository.getSettings(organizationId),
  ]);
  return {
    contacts,
    contentSid: config?.handoffContentSid ?? null,
  };
}
async function saveSettings(
  organizationId: string,
  userId: string,
  input: z.infer<typeof handoffSettingsSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "whatsapp",
    "admin",
  );
  // No provider request or sends while saving settings. Approval is rechecked at dispatch.
  await Repo.saveContacts(organizationId, input.contacts);
  await WhatsappAssistantRepository.upsertSettings(organizationId, {
    handoffContentSid: input.contentSid,
  });
  await BusinessAuditRepository.record({
    organizationId,
    actorUserId: userId,
    action: "whatsapp.handoff.settings",
    targetType: "whatsapp_assistant",
    targetId: organizationId,
    metadata: { contactCount: input.contacts.length },
  });
}
async function start(
  organizationId: string,
  conversationId: string,
  revision: number,
  reason: string,
  summary: string,
) {
  const validated = handoffInputSchema.parse({ reason, summary });
  const saved = await Repo.create({
    organizationId,
    conversationId,
    revision,
    ...validated,
  });
  if (saved)
    await wakeWhatsappReply({
      conversationId,
      dueAt: new Date().toISOString(),
    }).catch(() => {
      console.error(
        "Handoff saved; reply runner wakeup failed. Startup recovery will retry.",
      );
    });
  return saved;
}
async function pending(organizationId: string, userId: string) {
  await BusinessModuleService.requireAccess(organizationId, userId, "whatsapp");
  return Repo.pending(organizationId);
}

/** All recipients come from scoped persisted records, never a tool argument or an order phone. */
async function runDue(conversationId?: string) {
  const jobs = await Outbox.claimDue(conversationId);
  // At most twelve persisted claims per run; bounded parallel I/O stays inside the runner lease.
  await Promise.all(
    jobs.map(async (job) => {
      let dispatched = false;
      try {
        const [details, route, config] = await Promise.all([
          Outbox.details(job),
          CommunicationsRepository.getWhatsappConversationForSend(
            job.organizationId,
            job.conversationId,
          ),
          WhatsappAssistantRepository.getSettings(job.organizationId),
        ]);
        if (
          !details.handoff ||
          !route ||
          route.connection.status !== "connected" ||
          route.conversation.replyMode !== "manual" ||
          route.conversation.replyRevision !== details.handoff.replyRevision ||
          route.conversation.status !== "pending"
        ) {
          await Outbox.finish(
            job,
            "cancelled",
            "Chat was resolved or reply mode changed.",
          );
          return;
        }
        const customer = phone(route.conversation.externalConversationId);
        const recipient =
          job.kind === "ack" ? customer : phone(details.contact?.phone ?? null);
        if (
          !recipient ||
          (job.kind === "team" &&
            (!details.contact ||
              recipient === customer ||
              recipient === phone(route.connection.displayPhoneNumber)))
        ) {
          await Outbox.finish(
            job,
            "failed",
            "No valid staff destination; in-app handoff remains pending.",
          );
          return;
        }
        if (job.kind === "ack" && route.conversation.optedOutAt) {
          await Outbox.finish(job, "cancelled", "Customer opted out.");
          return;
        }
        const window = evaluateWhatsappWindow(
          await Outbox.lastInboundAt(
            job.organizationId,
            route.connection.id,
            recipient,
          ),
        );
        const customerWindow =
          job.kind === "ack"
            ? window
            : evaluateWhatsappWindow(
                await Outbox.lastInboundAt(
                  job.organizationId,
                  route.connection.id,
                  customer ?? "",
                ),
              );
        const expiry = customerWindow.expiresAt ?? "closed or unavailable";
        const variables = {
          "1": customer ?? "Unknown customer",
          "2": details.handoff.reason,
          "3": expiry,
        };
        const body =
          job.kind === "ack"
            ? HANDOFF_ACKNOWLEDGEMENT
            : `Customer ${variables["1"]} needs a person. Reason: ${variables["2"]}. Customer reply window closes at ${expiry}. Please review the pending chat in DU.`;
        let template;
        if (!window.windowOpen) {
          if (
            job.kind === "ack" ||
            route.connection.provider !== "twilio" ||
            !config?.handoffContentSid
          )
            throw new Error(
              "WhatsApp window closed; no safe approved handoff template configured. In-app notification saved.",
            );
          template = await fetchHandoffTemplate(
            route.connection,
            config.handoffContentSid,
          );
        }
        const appUrl = new URL(await getRequiredEnvValue("BETTER_AUTH_URL"));
        if (appUrl.protocol !== "https:" || appUrl.username || appUrl.password)
          throw new Error("Secure status callback unavailable");
        const statusCallbackUrl = new URL(
          `/api/whatsapp/${encodeURIComponent(route.connection.id)}`,
          appUrl.origin,
        ).href;
        // Claim immediately before provider I/O. A timeout/unknown response is never automatically resent.
        if (
          !(await Outbox.beginDispatch(
            job,
            details.handoff.replyRevision,
            body,
            route.connection.id,
            recipient,
          ))
        ) {
          await Outbox.finish(job, "cancelled", "Chat changed before dispatch");
          return;
        }
        dispatched = true;
        const send: typeof fetch = async (input, init) => {
          const response = await fetch(input, {
            ...init,
            redirect: "manual",
            signal: AbortSignal.timeout(15_000),
          });
          // Twilio 429 definitively rejected the request, safe for a bounded retry.
          if (response.status === 429) throw new HandoffRateLimit();
          return response;
        };
        const result = template
          ? await sendWhatsappTemplate(
              route.connection,
              recipient,
              { ...template, variables, statusCallbackUrl },
              send,
            )
          : await sendWhatsappText(route.connection, recipient, body, send, {
              statusCallbackUrl,
            });
        await Outbox.finish(
          job,
          ["failed", "undelivered"].includes(result.status) ? "failed" : "sent",
          ["failed", "undelivered"].includes(result.status)
            ? "Provider reported delivery failure"
            : null,
          result.externalMessageId,
        );
      } catch (error) {
        const retryable = !dispatched || error instanceof HandoffRateLimit;
        await Outbox.finish(
          job,
          retryable ? (job.attempts < 3 ? "retry" : "failed") : "unknown",
          retryable
            ? "Alert failed: WhatsApp window/template/provider unavailable. In-app notification saved."
            : "Provider acceptance uncertain; check provider before retrying. In-app notification saved.",
        );
      }
    }),
  );
}
class HandoffRateLimit extends Error {}
export const WhatsappHandoffService = {
  settings,
  saveSettings,
  start,
  pending,
  runDue,
};

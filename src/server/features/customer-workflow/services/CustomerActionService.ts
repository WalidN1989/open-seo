import { z } from "zod";
import { BusinessAuditRepository } from "@/server/features/business-modules/repositories/BusinessAuditRepository";
import {
  customerActionSchema,
  type CustomerAction,
} from "@/types/schemas/customerActions";
import { isSouthsideWorkflow } from "@/server/features/customer-workflow/policy";
import { AppError } from "@/server/lib/errors";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { BusinessModuleRepository } from "@/server/features/business-modules/repositories/BusinessModuleRepository";
import { EmailService } from "@/server/features/email/services/EmailService";
import { WhatsappAgentService } from "@/server/features/communications/services/WhatsappAgentService";
import { SmsService } from "@/server/features/sms/services/SmsService";
import { QuoteService } from "@/server/features/quotes/services/QuoteService";
import { QuoteEmailService } from "@/server/features/quotes/services/QuoteEmailService";
import { CrmService } from "@/server/features/crm/services/CrmService";
import { LeadDetailRepository } from "@/server/features/crm/repositories/LeadDetailRepository";
import { ActionRepository as Repo } from "../repositories/ActionRepository";
import { CallbackService } from "./CallbackService";

async function requireRollout(organizationId: string) {
  if (!(await isSouthsideWorkflow(organizationId)))
    throw new AppError(
      "FORBIDDEN",
      "This workflow is enabled only for South Side Fencing.",
    );
}
function moduleOf(action: CustomerAction) {
  if (action.kind === "quote") return "invoicing";
  if (action.kind === "sms") return "sms";
  if (action.kind.startsWith("whatsapp")) return "whatsapp";
  if (action.kind === "callback") return "voice";
  if (action.kind === "lead_stage") return "leads";
  return "email";
}
async function authorize(
  organizationId: string,
  userId: string,
  action: CustomerAction,
) {
  await requireRollout(organizationId);
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    moduleOf(action),
    "manage",
  );
  if (action.kind === "whatsapp" || action.kind === "whatsapp_template")
    await WhatsappAgentService.getChat(
      organizationId,
      userId,
      action.conversationId,
    );
  if (action.kind === "sms")
    await SmsService.thread(organizationId, userId, action.conversationId);
  if (action.kind === "email_reply")
    await EmailService.thread(organizationId, userId, action.threadId);
  if (action.kind === "lead_stage" || action.kind === "callback") {
    if (!(await LeadDetailRepository.getLead(organizationId, action.leadId)))
      throw new AppError("NOT_FOUND", "Lead not found.");
  }
}
async function reviewTarget(
  organizationId: string,
  userId: string,
  action: CustomerAction,
) {
  if (action.kind === "whatsapp" || action.kind === "whatsapp_template") {
    const chat = await WhatsappAgentService.getChat(
      organizationId,
      userId,
      action.conversationId,
    );
    const template =
      action.kind === "whatsapp_template"
        ? chat.templates.find((t) => t.id === action.templateId)
        : null;
    if (action.kind === "whatsapp_template" && !template)
      throw new AppError("VALIDATION_ERROR", "Approved template not found.");
    const rendered = template
      ? Object.entries(
          action.kind === "whatsapp_template" ? (action.variables ?? {}) : {},
        ).reduce(
          (text, [key, value]) => text.replaceAll(`{{${key}}}`, value),
          template.body,
        )
      : null;
    return {
      recipient: chat.chat.phone,
      templateId: template?.id ?? null,
      templateBody: template?.body ?? null,
      renderedBody: rendered,
    };
  }
  if (action.kind === "sms")
    return {
      recipient: (
        await SmsService.thread(organizationId, userId, action.conversationId)
      ).conversation.phone,
    };
  if (action.kind === "email_reply") {
    const thread = await EmailService.thread(
      organizationId,
      userId,
      action.threadId,
    );
    const last = thread.messages
      .filter((m) => m.direction === "inbound")
      .at(-1);
    if (!last)
      throw new AppError("VALIDATION_ERROR", "No inbound email to reply to.");
    return {
      recipient: last.fromAddress,
      replyToMessageId: last.id,
      subject: last.subject,
    };
  }
  if (action.kind === "email")
    return { recipient: action.to, subject: action.subject };
  if (action.kind === "callback")
    return { recipient: action.phone, reason: action.reason };
  if (action.kind === "lead_stage") {
    const workspace = await CrmService.getLeadsWorkspace(
      organizationId,
      userId,
    );
    const stage = workspace.stages.find(
      (candidate) => candidate.id === action.stageId,
    );
    const lead = await LeadDetailRepository.getLead(
      organizationId,
      action.leadId,
    );
    if (!stage || !lead)
      throw new AppError("NOT_FOUND", "Lead or stage not found.");
    return { lead: lead.lead.title, stage: stage.name };
  }
  return null;
}
async function request(
  organizationId: string,
  userId: string,
  raw: CustomerAction,
) {
  const action = customerActionSchema.parse(raw);
  await authorize(organizationId, userId, action);
  const quote =
    action.kind === "quote"
      ? await QuoteService.detail(organizationId, userId, action.quoteId)
      : null;
  const target = await reviewTarget(organizationId, userId, action);
  const stamp = new Date().toISOString();
  const row = await Repo.create({
    id: crypto.randomUUID(),
    organizationId,
    kind: action.kind,
    status: "needs_approval",
    leadId: "leadId" in action ? action.leadId : quote?.quote.leadId,
    quoteId: action.kind === "quote" ? action.quoteId : null,
    emailThreadId: action.kind === "email_reply" ? action.threadId : null,
    whatsappConversationId:
      action.kind === "whatsapp" || action.kind === "whatsapp_template"
        ? action.conversationId
        : null,
    smsConversationId: action.kind === "sms" ? action.conversationId : null,
    requestJson: JSON.stringify({ action, quote, target }),
    requestedByUserId: userId,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    createdAt: stamp,
    updatedAt: stamp,
  });
  return {
    status: "needs_approval" as const,
    approvalRequestId: row.id,
    message:
      "Draft saved. A human owner must review and approve this exact action in the Southside reporting view. Nothing sent.",
  };
}
/** Browser-only entry point. Never registered as an MCP tool. */
async function approve(
  organizationId: string,
  userId: string,
  requestId: string,
  approved: boolean,
) {
  await requireRollout(organizationId);
  const owner = await BusinessModuleRepository.findOwner(organizationId);
  if (!owner || owner.userId !== userId)
    throw new AppError(
      "FORBIDDEN",
      "Only the workspace owner can approve customer actions.",
    );
  const row = await Repo.transition(
    organizationId,
    requestId,
    ["needs_approval"],
    {
      status: approved ? "approved" : "rejected",
      approvedByUserId: userId,
      approvedAt: new Date().toISOString(),
    },
  );
  if (!row)
    throw new AppError(
      "VALIDATION_ERROR",
      "This request expired or was already reviewed.",
    );
  await BusinessAuditRepository.record({
    organizationId,
    actorUserId: userId,
    action: approved ? "customer_action.approved" : "customer_action.rejected",
    targetType: "customer_action",
    targetId: row.id,
  });
  return { id: row.id, status: row.status };
}
async function dispatch(
  organizationId: string,
  userId: string,
  action: CustomerAction,
) {
  switch (action.kind) {
    case "email":
      return EmailService.compose(organizationId, userId, action);
    case "email_reply":
      return EmailService.sendReply(organizationId, userId, action);
    case "whatsapp":
      return WhatsappAgentService.sendReply(organizationId, userId, action);
    case "whatsapp_template":
      return WhatsappAgentService.sendTemplate(organizationId, userId, action);
    case "sms":
      return SmsService.agentSend(organizationId, userId, action);
    case "quote":
      return QuoteEmailService.emailQuote(organizationId, userId, action, true);
    case "lead_stage":
      return CrmService.updateLead(organizationId, userId, {
        id: action.leadId,
        stageId: action.stageId,
      });
    case "callback":
      return CallbackService.start(organizationId, userId, action);
  }
}
async function execute(
  organizationId: string,
  userId: string,
  requestId: string,
) {
  await requireRollout(organizationId);
  const row = await Repo.get(organizationId, requestId);
  if (!row) throw new AppError("NOT_FOUND", "Action request not found.");
  if (row.status !== "approved")
    return {
      status: row.status,
      approvalRequestId: row.id,
      message:
        "Needs human approval, or this action has already been processed. Nothing sent.",
    };
  const saved: unknown = JSON.parse(row.requestJson);
  if (!saved || typeof saved !== "object" || !("action" in saved))
    throw new AppError("VALIDATION_ERROR", "Invalid saved action.");
  const action = customerActionSchema.parse(saved.action);
  await authorize(organizationId, userId, action);
  const currentTarget = await reviewTarget(organizationId, userId, action);
  if (
    JSON.stringify(currentTarget) !==
    JSON.stringify("target" in saved ? saved.target : null)
  ) {
    await Repo.transition(organizationId, row.id, ["approved"], {
      status: "stale",
      error: "Recipient, reply target or template changed after review.",
    });
    throw new AppError(
      "VALIDATION_ERROR",
      "The recipient or content changed; request approval again.",
    );
  }
  // Approval binds the whole quote, not merely its id. Edits require a new approval.
  if (
    action.kind === "quote" &&
    JSON.stringify(
      await QuoteService.detail(organizationId, userId, action.quoteId),
    ) !== JSON.stringify("quote" in saved ? saved.quote : null)
  ) {
    await Repo.transition(organizationId, row.id, ["approved"], {
      status: "stale",
      error: "Quote changed after review. Request approval again.",
    });
    throw new AppError(
      "VALIDATION_ERROR",
      "Quote changed; a new approval is required.",
    );
  }
  const claim = await Repo.transition(organizationId, row.id, ["approved"], {
    status: "sending",
  });
  if (!claim)
    throw new AppError(
      "VALIDATION_ERROR",
      "Approval expired or this action was already claimed.",
    );
  try {
    const result = await dispatch(organizationId, userId, action);
    const callback =
      action.kind === "callback"
        ? z.object({ conversationId: z.string().nullable() }).safeParse(result)
        : null;
    await Repo.finish(organizationId, row.id, {
      providerConversationId: callback?.success
        ? callback.data.conversationId
        : null,
      status: "completed",
      resultJson: JSON.stringify(result),
    });
    return { status: "completed", approvalRequestId: row.id, result };
  } catch {
    // Provider acceptance can precede a network failure. Never replay blindly.
    await Repo.finish(organizationId, row.id, {
      status: "unknown",
      error:
        "The action could not be confirmed. Check provider history before creating another send request.",
    });
    return {
      status: "unknown",
      approvalRequestId: row.id,
      message:
        "Outcome unconfirmed; human attention required. No automatic retry.",
    };
  }
}
export const CustomerActionService = { request, approve, execute };

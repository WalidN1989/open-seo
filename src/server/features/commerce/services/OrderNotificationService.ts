import { formatMoney } from "@/shared/currencies";
import { CommunicationsRepository } from "@/server/features/communications/repositories/CommunicationsRepository";
import { sendWhatsappTemplate } from "@/server/features/communications/providers/whatsapp";
import { OrderOperationsRepository as Repo } from "../repositories/OrderOperationsRepository";
import {
  dispatchCurrent,
  skipChanged,
  currentWooTemplate,
} from "./OrderDispatchService";
import type { ActionContext } from "./OrderOperationsService";
export async function sendNotification(context: ActionContext) {
  const { effect, order, claim, sender, template } = context;
  if (!sender || !template) return;

  if (!order.customerPhone) {
    await Repo.finish(effect.organizationId, claim.id, {
      status: "skipped",
      error: "Order has no valid WhatsApp recipient.",
    });
    return;
  }
  const availableVariables: Record<string, string> = {
    "1": order.customerName?.split(/\s+/)[0] || "there",
    "2":
      order.externalSource === "woocommerce"
        ? order.orderNumber.replace(/^WOO-/, "")
        : order.orderNumber,
    "3": order.currency ? formatMoney(order.totalMinor, order.currency) : "",
  };
  const variables: Record<string, string> = {};
  const body = template.body.replace(
    /\{\{\s*([^}]+?)\s*\}\}/g,
    (_match, slot: string) => {
      if (!Object.hasOwn(availableVariables, slot))
        throw new Error("Unsupported order confirmation variable.");
      variables[slot] = availableVariables[slot];
      return availableVariables[slot];
    },
  );
  if (
    order.externalSource === "woocommerce" &&
    !(await currentWooTemplate(sender, template))
  ) {
    // No message request has been made, so approval/API recovery can retry.
    // Never use this path after an ambiguous provider send outcome.
    await Repo.finish(effect.organizationId, claim.id, {
      status: "queued",
      claimedAt: null,
      nextAttemptAt: new Date(Date.now() + 300_000).toISOString(),
      error:
        "Waiting for current utility-template approval. No message submitted.",
    });
    return;
  }
  const messageId = await Repo.message(
    effect.organizationId,
    sender.id,
    order.customerPhone,
    body,
    claim.id,
  );
  if (!messageId) {
    await Repo.finish(effect.organizationId, claim.id, {
      status: "skipped",
      error: "Recipient opted out.",
    });
    return;
  }
  if (!(await dispatchCurrent(context))) {
    await CommunicationsRepository.completeWhatsappMessage(
      effect.organizationId,
      messageId,
      { status: "failed" },
    );
    await skipChanged(context);
    return;
  }
  const result = await sendWhatsappTemplate(sender, order.customerPhone, {
    ...template,
    variables,
  }).catch(async (error: unknown) => {
    await CommunicationsRepository.completeWhatsappMessage(
      effect.organizationId,
      messageId,
      { status: "unknown" },
    );
    throw error;
  });
  await CommunicationsRepository.completeWhatsappMessage(
    effect.organizationId,
    messageId,
    {
      externalMessageId: result.externalMessageId,
      status: result.status,
      sentAt: new Date().toISOString(),
    },
  );
  await Repo.finish(effect.organizationId, claim.id, {
    status: ["failed", "undelivered"].includes(result.status)
      ? "unknown"
      : "succeeded",
    externalId: result.externalMessageId,
    messageId,
  });
  return;
}

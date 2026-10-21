import { fetchOrderConfirmationTemplate } from "@/server/features/communications/providers/twilioContent";
import { OrderOperationsRepository as Repo } from "../repositories/OrderOperationsRepository";
import type { ActionContext } from "./OrderOperationsService";
export async function dispatchCurrent(context: ActionContext) {
  const { effect, claim, order, config, sender, template } = context;
  const cutoff =
    effect.kind === "confirmation" || effect.kind === "cancellation"
      ? config.confirmationStartedAt
      : config.operationsStartedAt;
  if (!cutoff || Date.parse(order.createdAt) < Date.parse(cutoff)) return false;
  const connectionId =
    order.operationsConnectionId || order.integrationConnectionId;
  if (!connectionId) return false;
  const current = await Repo.configuration(effect.organizationId, connectionId);
  const keys = [
    "enabled",
    "confirmationStartedAt",
    "operationsStartedAt",
    "confirmationSenderId",
    "confirmationTemplateId",
    "pickupTemplateId",
    "cancellationTemplateId",
    "invoiceEnabled",
    "courierCredentials",
    "senderName",
    "senderPhone",
    "senderAddress1",
    "senderAddress2",
    "senderAddress3",
    "senderCity",
    "parcelWeightGrams",
  ] as const;
  if (!current || keys.some((key) => current[key] !== config[key]))
    return false;
  if (sender && template) {
    const latestSender = await Repo.sender(effect.organizationId, sender.id);
    const latestTemplate = await Repo.template(
      effect.organizationId,
      template.id,
    );
    if (
      JSON.stringify(latestSender) !== JSON.stringify(sender) ||
      JSON.stringify(latestTemplate) !== JSON.stringify(template)
    )
      return false;
  }
  return Repo.canDispatch(effect.organizationId, claim.id, order.id, {
    kind: effect.kind,
    revision: order.updatedAt,
  });
}
export async function skipChanged(context: ActionContext) {
  await Repo.finish(context.effect.organizationId, context.claim.id, {
    status: "skipped",
    error:
      "Order or automation settings changed before dispatch; no provider request was made.",
  });
}
export async function notificationFor(
  effect: ActionContext["effect"],
  order: ActionContext["order"],
  config: ActionContext["config"],
) {
  const sender = await Repo.sender(
    effect.organizationId,
    config.confirmationSenderId || "",
  );
  const templateId =
    effect.kind === "cancellation"
      ? config.cancellationTemplateId
      : order.pickup
        ? config.pickupTemplateId || config.confirmationTemplateId
        : config.confirmationTemplateId;
  const template = await Repo.template(effect.organizationId, templateId || "");
  if (
    !sender ||
    sender.status !== "connected" ||
    !template ||
    template.connectionId !== sender.id
  )
    return null;
  if (
    order.externalSource === "woocommerce" &&
    !(await currentWooTemplate(sender, template))
  )
    return null;
  return { sender, template };
}

export async function currentWooTemplate(
  sender: NonNullable<ActionContext["sender"]>,
  template: NonNullable<ActionContext["template"]>,
) {
  if (
    sender.provider !== "twilio" ||
    template.category.toUpperCase() !== "UTILITY" ||
    !template.externalTemplateId
  )
    return false;
  try {
    const current = await fetchOrderConfirmationTemplate(
      sender,
      template.externalTemplateId,
    );
    return (
      current.status === "approved" &&
      current.body === template.body &&
      current.languageCode === template.languageCode
    );
  } catch {
    return false;
  }
}

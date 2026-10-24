import { currentUtilityTemplate } from "./OrderDispatchService";
import { supportsShipmentVariables } from "@/shared/shipment-messages";
import { ShipmentMessagesRepository as Repo } from "../repositories/ShipmentMessagesRepository";
import { OrderOperationsRepository as Operations } from "../repositories/OrderOperationsRepository";
import { OrderRepository } from "../repositories/OrderRepository";
import { CommunicationsRepository } from "@/server/features/communications/repositories/CommunicationsRepository";
import { sendWhatsappTemplate } from "@/server/features/communications/providers/whatsapp";
const DAY = 24 * 60 * 60 * 1000;
function settingsUnchanged(
  current: Awaited<ReturnType<typeof Operations.configuration>>,
  expected: NonNullable<Awaited<ReturnType<typeof Operations.configuration>>>,
) {
  return Boolean(
    current &&
    current.shipmentMessagesStartedAt === expected.shipmentMessagesStartedAt &&
    current.shipmentSenderId === expected.shipmentSenderId &&
    current.waybillTemplateId === expected.waybillTemplateId &&
    current.deliveryEstimateTemplateId === expected.deliveryEstimateTemplateId,
  );
}

// Keep the two notifications a day apart even after worker downtime.
async function estimateReady(
  organizationId: string,
  orderId: string,
  generatedAt: string,
) {
  const first = (await Operations.effects(organizationId, orderId)).find(
    (e) => e.kind === "waybill",
  );
  return (
    first?.status === "succeeded" &&
    Boolean(first.completedAt) &&
    Date.now() >= Date.parse(generatedAt) + DAY &&
    Date.now() >= Date.parse(first.completedAt || "") + DAY
  );
}
async function process(
  effect: Awaited<ReturnType<typeof Repo.due>>[number]["effect"],
) {
  const order = await OrderRepository.getOrder(
    effect.organizationId,
    effect.orderId,
  );
  const connectionId =
    order?.operationsConnectionId || order?.integrationConnectionId;
  if (!order || !connectionId) return;
  const config = await Operations.configuration(
    effect.organizationId,
    connectionId,
  );
  if (!config?.shipmentMessagesStartedAt || !config.shipmentSenderId) return;
  const shipment = (
    await OrderRepository.shipments(effect.organizationId, order.id)
  ).find(
    (s) => s.provider === "Citypak" && s.trackingNumber === effect.externalId,
  );
  if (
    !shipment ||
    Date.parse(shipment.createdAt) <
      Date.parse(config.shipmentMessagesStartedAt)
  )
    return;
  if (
    effect.kind === "delivery_estimate" &&
    !(await estimateReady(effect.organizationId, order.id, shipment.createdAt))
  )
    return;
  const templateId =
    effect.kind === "waybill"
      ? config.waybillTemplateId
      : config.deliveryEstimateTemplateId;
  const sender = await Operations.sender(
    effect.organizationId,
    config.shipmentSenderId,
  );
  const template = await Operations.template(
    effect.organizationId,
    templateId || "",
  );
  if (
    !sender ||
    sender.provider !== "twilio" ||
    sender.status !== "connected" ||
    !template ||
    !supportsShipmentVariables(template) ||
    template.connectionId !== sender.id ||
    !order.customerPhone
  )
    return;
  if (!(await currentUtilityTemplate(sender, template))) return;
  const claim = await Operations.claim(
    effect.organizationId,
    order.id,
    effect.kind,
    order.updatedAt,
  );
  if (!claim) return;
  let messageId: string | null = null;
  try {
    const variables = {
      "1": order.customerName?.split(/\s+/)[0] || "there",
      "2": order.orderNumber,
      "3": shipment.trackingNumber,
    };
    const body = template.body
      .replaceAll("{{1}}", variables["1"])
      .replaceAll("{{2}}", variables["2"])
      .replaceAll("{{3}}", variables["3"]);
    messageId = await Operations.message(
      effect.organizationId,
      sender.id,
      order.customerPhone,
      body,
      claim.id,
    );
    const current = await Operations.configuration(
      effect.organizationId,
      connectionId,
    );
    const currentSender = await Operations.sender(
      effect.organizationId,
      sender.id,
    );
    const currentTemplate = await Operations.template(
      effect.organizationId,
      template.id,
    );
    const latestShipment = (
      await OrderRepository.shipments(effect.organizationId, order.id)
    ).find((s) => s.id === shipment.id);
    const valid =
      messageId &&
      settingsUnchanged(current, config) &&
      JSON.stringify(currentSender) === JSON.stringify(sender) &&
      JSON.stringify(currentTemplate) === JSON.stringify(template) &&
      (await currentUtilityTemplate(sender, template)) &&
      latestShipment &&
      latestShipment.trackingNumber === shipment.trackingNumber &&
      !["DELIVERED", "RETURNED", "RTM", "CANCELLED"].includes(
        latestShipment.status,
      ) &&
      (await Operations.canDispatch(effect.organizationId, claim.id, order.id, {
        kind: effect.kind,
        revision: order.updatedAt,
      }));
    if (!valid || !messageId) {
      if (messageId)
        await CommunicationsRepository.completeWhatsappMessage(
          effect.organizationId,
          messageId,
          { status: "failed" },
        );
      await Operations.finish(effect.organizationId, claim.id, {
        status: "skipped",
        error:
          "Recipient, order, shipment or notification settings no longer permit sending.",
      });
      return;
    }
    const result = await sendWhatsappTemplate(sender, order.customerPhone, {
      ...template,
      variables,
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
    await Operations.finish(effect.organizationId, claim.id, {
      status: ["failed", "undelivered"].includes(result.status)
        ? "unknown"
        : "succeeded",
      messageId,
      externalId: result.externalMessageId,
    });
  } catch {
    if (messageId)
      await CommunicationsRepository.completeWhatsappMessage(
        effect.organizationId,
        messageId,
        { status: "unknown" },
      );
    await Operations.finish(effect.organizationId, claim.id, {
      status: "unknown",
      error:
        "Check Twilio history before any manual recovery; message may already have been accepted.",
    });
  }
}
async function runDue(connectionId: string) {
  for (const { order, shipment } of await Repo.candidates(connectionId)) {
    await Repo.enqueue(
      order.organizationId,
      order.id,
      "waybill",
      shipment.trackingNumber,
      shipment.createdAt,
    );
    const config = await Operations.configuration(
      order.organizationId,
      connectionId,
    );
    if (config?.deliveryEstimateTemplateId)
      await Repo.enqueue(
        order.organizationId,
        order.id,
        "delivery_estimate",
        shipment.trackingNumber,
        new Date(Date.parse(shipment.createdAt) + DAY).toISOString(),
      );
  }
  for (const { effect } of await Repo.due(connectionId)) {
    await process(effect);
    await Operations.defer(effect.organizationId, effect.id);
  }
}
export const ShipmentMessagesService = { runDue };

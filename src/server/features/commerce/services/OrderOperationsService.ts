import { sendNotification } from "./OrderNotificationService";
import {
  dispatchCurrent,
  skipChanged,
  notificationFor,
} from "./OrderDispatchService";
import { OrderLoyaltyRepository } from "../repositories/OrderLoyaltyRepository";
import { IntegrationSyncRepository } from "../repositories/IntegrationSyncRepository";
import { BusinessModuleRepository } from "@/server/features/business-modules/repositories/BusinessModuleRepository";
import { InvoiceRepository } from "@/server/features/invoicing/repositories/InvoiceRepository";
import { settingsOrDefaults } from "@/server/features/invoicing/issuer";
import {
  documentPath,
  DOCUMENT_LINK_TTL_MS,
  signDocumentToken,
} from "@/server/features/invoicing/documentLink";
import { EmailSendService } from "@/server/features/email/services/EmailSendService";
import { decryptCredentials } from "@/server/lib/connection-secrets";
import { getRequiredEnvValue } from "@/server/lib/runtime-env";
import { OrderOperationsRepository as Repo } from "../repositories/OrderOperationsRepository";
import { OrderRepository } from "../repositories/OrderRepository";
import { createCitypakOrder } from "../providers/citypak";

async function enqueueForWebhook(
  organizationId: string,
  connectionId: string,
  orderId: string,
  topic: string,
) {
  const config = await Repo.configuration(organizationId, connectionId);
  const order = await OrderRepository.getOrder(organizationId, orderId);
  if (
    !config?.confirmationStartedAt ||
    !order ||
    Date.parse(order.createdAt) < Date.parse(config.confirmationStartedAt)
  )
    return;
  if (topic === "orders/create" && order.status !== "cancelled")
    await Repo.enqueue(organizationId, order.id, "confirmation");
  if (topic === "orders/cancelled" && config.cancellationTemplateId)
    await Repo.enqueue(organizationId, order.id, "cancellation");
}
async function enqueueApproved(organizationId: string, orderId: string) {
  const order = await OrderRepository.getOrder(organizationId, orderId);
  const connectionId =
    order?.operationsConnectionId || order?.integrationConnectionId;
  if (!order || !connectionId) return;
  const config = await Repo.configuration(organizationId, connectionId);
  if (
    !config?.enabled ||
    !config.operationsStartedAt ||
    Date.parse(order.createdAt) < Date.parse(config.operationsStartedAt)
  )
    return;
  if (order.approvalStatus !== "approved" || order.status !== "confirmed")
    return;
  const modules =
    await BusinessModuleRepository.listEntitlements(organizationId);
  const connection = await IntegrationSyncRepository.getConnection(
    organizationId,
    connectionId,
  );
  if (
    connection?.status !== "connected" ||
    !modules.some(
      (row) => row.moduleKey === "integrations" && row.status === "enabled",
    )
  )
    return;
  if (order.currency !== "LKR") return;
  if (!order.pickup) await Repo.enqueue(organizationId, order.id, "citypak");
  if (config.invoiceEnabled)
    await Repo.enqueue(organizationId, order.id, "invoice");
  await OrderLoyaltyRepository.award(
    organizationId,
    order,
    config.loyaltyMinorPerPoint,
  );
}
export type ActionContext = {
  effect: Awaited<ReturnType<typeof Repo.due>>[number];
  claim: NonNullable<Awaited<ReturnType<typeof Repo.claim>>>;
  order: NonNullable<Awaited<ReturnType<typeof OrderRepository.getOrder>>>;
  config: NonNullable<Awaited<ReturnType<typeof Repo.configuration>>>;
  credentials: Awaited<ReturnType<typeof decryptCredentials>>;
  enabled: (module: string) => boolean;
  sender: Awaited<ReturnType<typeof Repo.sender>> | null;
  template: Awaited<ReturnType<typeof Repo.template>> | null;
};
async function createShipment(context: ActionContext) {
  const { effect, order, config, claim, credentials } = context;

  const existing = (
    await OrderRepository.shipments(effect.organizationId, order.id)
  ).find((row) => row.provider === "Citypak");
  if (existing) {
    await Repo.finish(effect.organizationId, claim.id, {
      status: "legacy",
      externalId: existing.trackingNumber,
    });
    return;
  }
  if (order.pickup || order.status !== "confirmed") {
    await Repo.finish(effect.organizationId, claim.id, {
      status: "skipped",
    });
    return;
  }
  const lines = await OrderRepository.listLines(
    effect.organizationId,
    order.id,
  );
  const address = (order.shippingAddress || "")
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!order.customerPhone || !order.shippingAddress || !order.shippingCity) {
    await Repo.finish(effect.organizationId, claim.id, {
      status: "failed",
      error:
        "Missing delivery phone, address or city. No Citypak request was made. Confirm whether this is a pickup order before arranging delivery.",
    });
    return;
  }
  if (!(await dispatchCurrent(context))) {
    await skipChanged(context);
    return;
  }
  const result = await createCitypakOrder(credentials.API_KEY, {
    reference: order.orderNumber,
    from_name: config.senderName || "",
    from_contact_name: config.senderName || "",
    from_contact_1: config.senderPhone || "",
    from_contact_2: "",
    from_address_line_1: config.senderAddress1 || "",
    from_address_line_2: config.senderAddress2 || "",
    from_address_line_3: config.senderAddress3 || "",
    from_address_line_4: config.senderCity || "",
    to_name: order.customerName || "Customer",
    to_contact_name: order.customerName || "Customer",
    to_contact_1: order.customerPhone,
    to_contact_2: "",
    to_address_line_1: address[0] || "",
    to_address_line_2: address[1] || "",
    to_address_line_3: address.slice(2).join(", "),
    to_address_line_4: order.shippingCity,
    to_nic: "",
    description:
      lines
        .map((line) => `${line.quantity}x ${line.description}`)
        .join(", ")
        .replace(/[^\x20-\x7E]/g, "")
        .slice(0, 128) || "Books",
    weight_g: config.parcelWeightGrams,
    number_of_pieces: 1,
    cash_on_delivery_amount:
      Math.max(0, order.totalMinor - order.paidMinor) / 100,
  });
  await Repo.recordShipment(
    effect.organizationId,
    order.id,
    result.trackingNumber,
    result.externalId,
  );
  await Repo.finish(effect.organizationId, claim.id, {
    status: "succeeded",
    externalId: result.trackingNumber,
  });
  return;
}
async function issueOrderInvoice(context: ActionContext) {
  const { effect, order, claim, enabled } = context;

  const issuer = settingsOrDefaults(
    await InvoiceRepository.getSettings(effect.organizationId),
  );
  const lines = await OrderRepository.listLines(
    effect.organizationId,
    order.id,
  );
  if (!(await dispatchCurrent(context))) {
    await skipChanged(context);
    return;
  }
  const invoiceId = await InvoiceRepository.issueInvoice(
    order,
    lines.map((line, position) => ({
      id: `retail:${line.id}`,
      invoiceId: `retail:${order.id}`,
      organizationId: effect.organizationId,
      position,
      description: line.description,
      quantityMilli: line.quantity * 1000,
      unitPriceMinor: line.unitPriceMinor,
      amountMinor: line.lineTotalMinor,
    })),
    JSON.stringify(issuer),
  );
  if (order.customerEmail && enabled("email")) {
    const token = await signDocumentToken(
      {
        invoiceId,
        organizationId: effect.organizationId,
        expiresAt: Date.now() + DOCUMENT_LINK_TTL_MS,
      },
      await getRequiredEnvValue("BETTER_AUTH_SECRET"),
    );
    const url = `${(await getRequiredEnvValue("BETTER_AUTH_URL")).replace(/\/$/, "")}${documentPath(invoiceId, token)}`;
    if (!(await dispatchCurrent(context))) {
      await skipChanged(context);
      return;
    }
    const sent = await EmailSendService.sendFromConnectedMailbox(
      effect.organizationId,
      {
        to: order.customerEmail,
        subject: `Order ${order.orderNumber} invoice`,
        text: `Hi ${order.customerName || "there"},\n\nYour order ${order.orderNumber} has been approved. View your invoice: ${url}\n\nThank you for shopping with ${issuer.legalName || "us"}.`,
        authoredBy: null,
      },
    );
    if (sent)
      await InvoiceRepository.recordInvoiceSent(
        effect.organizationId,
        invoiceId,
      );
  }
  await Repo.finish(effect.organizationId, claim.id, {
    status: "succeeded",
    invoiceId,
  });
}
function staleAction(
  effect: ActionContext["effect"],
  order: ActionContext["order"],
  messaging: boolean,
) {
  if (effect.kind === "confirmation") return order.status === "cancelled";
  if (effect.kind === "cancellation") return order.status !== "cancelled";
  return !messaging && order.status !== "confirmed";
}
async function process(effect: Awaited<ReturnType<typeof Repo.due>>[number]) {
  const order = await OrderRepository.getOrder(
    effect.organizationId,
    effect.orderId,
  );
  const connectionId =
    order?.operationsConnectionId || order?.integrationConnectionId;
  if (!order || !connectionId) return;
  const config = await Repo.configuration(effect.organizationId, connectionId);
  if (!config?.enabled) return;
  const connection = await IntegrationSyncRepository.getConnection(
    effect.organizationId,
    connectionId,
  );
  if (connection?.status !== "connected") return;
  const entitlements = await BusinessModuleRepository.listEntitlements(
    effect.organizationId,
  );
  const enabled = (module: string) =>
    entitlements.some(
      (row) => row.moduleKey === module && row.status === "enabled",
    );
  if (!enabled("crm") || !enabled("integrations")) return;
  const messaging =
    effect.kind === "confirmation" || effect.kind === "cancellation";
  if (messaging && (!config.confirmationStartedAt || !enabled("whatsapp")))
    return;
  if (
    !messaging &&
    (!config.operationsStartedAt || order.approvalStatus !== "approved")
  )
    return;
  if (
    effect.kind === "invoice" &&
    (!config.invoiceEnabled || !enabled("invoicing"))
  )
    return;
  const notification = messaging
    ? await notificationFor(effect, order, config)
    : null;
  if (messaging && !notification) return;
  const sender = notification?.sender ?? null;
  const template = notification?.template ?? null;
  const credentials = await decryptCredentials(config.courierCredentials);
  if (effect.kind === "citypak" && !credentials.API_KEY) return;
  const stale = staleAction(effect, order, messaging);
  const claim = await Repo.claim(
    effect.organizationId,
    effect.orderId,
    effect.kind,
    order.updatedAt,
  );
  if (!claim) return;
  if (stale || (!messaging && order.currency !== "LKR")) {
    await Repo.finish(effect.organizationId, claim.id, {
      status: "skipped",
      error: stale
        ? "Order state no longer permits this action."
        : "Citypak and loyalty require an LKR order.",
    });
    return;
  }
  try {
    const context = {
      effect,
      order,
      config,
      claim,
      credentials,
      enabled,
      sender,
      template,
    };
    if (messaging) await sendNotification(context);
    else if (effect.kind === "citypak") await createShipment(context);
    else if (effect.kind === "invoice") await issueOrderInvoice(context);
  } catch {
    await Repo.finish(effect.organizationId, claim.id, {
      status: "unknown",
      error:
        "Check provider history before retrying; delivery may already have been accepted.",
    });
  }
}
async function runDue(connectionId?: string) {
  for (const effect of await Repo.due(connectionId)) {
    if (connectionId && effect.kind !== "citypak") continue;
    await process(effect);
    await Repo.defer(effect.organizationId, effect.id);
  }
}
async function runDueConfirmations(
  organizationId: string,
  connectionId: string,
) {
  for (const effect of await Repo.dueConfirmations(
    organizationId,
    connectionId,
  )) {
    await process(effect);
    await Repo.defer(effect.organizationId, effect.id);
  }
}
export const OrderOperationsService = {
  runDueConfirmations,
  enqueueForWebhook,
  enqueueApproved,
  runDue,
};

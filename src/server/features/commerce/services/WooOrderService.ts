import { z } from "zod";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { BusinessModuleRepository } from "@/server/features/business-modules/repositories/BusinessModuleRepository";
import { CommunicationsRepository } from "@/server/features/communications/repositories/CommunicationsRepository";
import { fetchOrderConfirmationTemplate } from "@/server/features/communications/providers/twilioContent";
import { AppError } from "@/server/lib/errors";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import type { wooConfirmationSchema } from "@/types/schemas/wooOrders";
import { fetchWooOrderPage } from "../providers/woocommerce";
import {
  wooOrderSchema,
  wooOrderSnapshot,
} from "../providers/woocommerceOrders";
import { WooOrderRepository as Repo } from "../repositories/WooOrderRepository";
import { IntegrationSyncRepository } from "../repositories/IntegrationSyncRepository";
import { OrderOperationsRepository } from "../repositories/OrderOperationsRepository";
import { BranchRepository } from "../repositories/BranchRepository";
import { mirrorOrder } from "../repositories/OrderMirrorRepository";
import { OrderOperationsService } from "./OrderOperationsService";

const cursorSchema = z.object({
  after: z.iso.datetime(),
  startedAt: z.iso.datetime(),
  page: z.number().int().positive(),
});
async function requireManage(organizationId: string, userId: string) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "crm",
    "manage",
  );
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "integrations",
    "manage",
  );
}
async function connectionFor(organizationId: string, connectionId: string) {
  const connection = await IntegrationSyncRepository.getConnection(
    organizationId,
    connectionId,
  );
  if (
    connection?.providerKey !== "woocommerce" ||
    connection.status !== "connected"
  )
    throw new AppError("NOT_FOUND");
  return connection;
}
async function settings(organizationId: string, userId: string) {
  await BusinessModuleService.requireAccess(organizationId, userId, "crm");
  const allowlist =
    (await getOptionalEnvValue("WOOCOMMERCE_ORDER_CONNECTION_IDS"))
      ?.split(",")
      .map((id) => id.trim()) ?? [];
  return Promise.all(
    (await Repo.connections(organizationId)).map(
      async ({ connection, sync: config }) => {
        const template = config?.confirmationTemplateId
          ? await CommunicationsRepository.getWhatsappTemplate(
              organizationId,
              config.confirmationTemplateId,
            )
          : null;
        return {
          connectionId: connection.id,
          displayName: connection.displayName,
          enabled: config?.enabled ?? false,
          lastSyncedAt: config?.lastSyncedAt ?? null,
          workerEnabled: allowlist.includes(connection.id),
          confirmationStartedAt: config?.confirmationStartedAt ?? null,
          senderId: config?.confirmationSenderId ?? null,
          contentSid: template?.externalTemplateId ?? null,
          templateStatus: template?.status ?? null,
        };
      },
    ),
  );
}
async function enable(
  organizationId: string,
  userId: string,
  connectionId: string,
  enabled: boolean,
) {
  await requireManage(organizationId, userId);
  await connectionFor(organizationId, connectionId);
  const config = await OrderOperationsRepository.configuration(
    organizationId,
    connectionId,
  );
  await Repo.enable(organizationId, connectionId, enabled);
  if (enabled && !config?.cursor) {
    const now = new Date().toISOString();
    await Repo.progress(
      organizationId,
      connectionId,
      null,
      JSON.stringify({ after: now, startedAt: now, page: 1 }),
      0,
    );
  }
}
async function configureConfirmation(
  organizationId: string,
  userId: string,
  input: z.infer<typeof wooConfirmationSchema>,
) {
  await requireManage(organizationId, userId);
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "whatsapp",
    "manage",
  );
  await connectionFor(organizationId, input.connectionId);
  const config = await OrderOperationsRepository.configuration(
    organizationId,
    input.connectionId,
  );
  if (!config?.enabled)
    throw new AppError(
      "VALIDATION_ERROR",
      "Enable WooCommerce order sync first.",
    );
  if (!input.enabled) {
    await OrderOperationsRepository.configure(
      organizationId,
      input.connectionId,
      { confirmationStartedAt: null },
    );
    return;
  }
  const sender = await OrderOperationsRepository.sender(
    organizationId,
    input.senderId || "",
  );
  if (
    !sender ||
    sender.provider !== "twilio" ||
    sender.status !== "connected" ||
    !input.contentSid
  )
    throw new AppError(
      "VALIDATION_ERROR",
      "Choose the connected Twilio sender and submitted order confirmation SID.",
    );
  const verified = await fetchOrderConfirmationTemplate(
    sender,
    input.contentSid,
  );
  const templateId = await Repo.saveTemplate(
    organizationId,
    sender.id,
    input.contentSid,
    verified,
  );
  await OrderOperationsRepository.configure(
    organizationId,
    input.connectionId,
    {
      confirmationSenderId: sender.id,
      confirmationTemplateId: templateId,
      confirmationStartedAt:
        config.confirmationStartedAt || new Date().toISOString(),
      // WooCommerce setup only opts into confirmation, not fulfillment or invoices.
    },
  );
}
async function mirrorPage(
  connection: Awaited<ReturnType<typeof connectionFor>>,
  page: number,
  after: string | null,
  notify: boolean,
) {
  const fetched = await fetchWooOrderPage(connection, page, after);
  // Incomplete checkout drafts can have null dates and no lines. Exclude them
  // before parsing sale data, so one abandoned checkout cannot block the page.
  const pageRows = z
    .array(z.looseObject({ status: z.string() }))
    .max(25)
    .safeParse(fetched.payload);
  const orders = z
    .array(wooOrderSchema)
    .safeParse(
      pageRows.success
        ? pageRows.data.filter(
            (order) => !["checkout-draft", "trash"].includes(order.status),
          )
        : null,
    );
  if (!orders.success)
    throw new AppError(
      "INTEGRATION_CHECK_FAILED",
      "WooCommerce returned unsupported order data. Check order permissions, statuses and currency amounts.",
    );
  const branch = await BranchRepository.resolve(connection.organizationId);
  for (const order of orders.data) {
    if (order.status === "checkout-draft" || order.status === "trash") continue;
    const id = await mirrorOrder(
      connection.organizationId,
      connection.id,
      branch.id,
      wooOrderSnapshot(order),
    );
    if (
      notify &&
      order.line_items.length > 0 &&
      ["pending", "processing", "on-hold", "completed"].includes(order.status)
    )
      await OrderOperationsService.enqueueForWebhook(
        connection.organizationId,
        connection.id,
        id,
        "orders/create",
      );
  }
  return {
    imported: orders.data.filter(
      (order) => !["checkout-draft", "trash"].includes(order.status),
    ).length,
    hasMore: fetched.hasMore,
  };
}
async function importHistory(
  organizationId: string,
  userId: string,
  connectionId: string,
  page: number,
) {
  await requireManage(organizationId, userId);
  const row = await Repo.enabledConnection(connectionId);
  if (!row || row.connection.organizationId !== organizationId)
    throw new AppError("NOT_FOUND");
  // History never changes the live cursor and never queues customer messages.
  return mirrorPage(row.connection, page, null, false);
}
async function sync(connectionId: string) {
  const row = await Repo.enabledConnection(connectionId);
  if (!row) return false;
  const organizationId = row.connection.organizationId;
  const modules =
    await BusinessModuleRepository.listEntitlements(organizationId);
  if (
    !["crm", "integrations"].every((key) =>
      modules.some((m) => m.moduleKey === key && m.status === "enabled"),
    )
  )
    return false;
  const now = new Date().toISOString();
  const cursor = row.sync.cursor
    ? cursorSchema.parse(JSON.parse(row.sync.cursor))
    : { after: now, startedAt: now, page: 1 };
  // Overlap the watermark for coarse provider timestamps and same-second updates.
  const result = await mirrorPage(
    row.connection,
    cursor.page,
    cursor.after,
    true,
  );
  const next = result.hasMore
    ? { ...cursor, page: cursor.page + 1 }
    : {
        after: new Date(Date.parse(cursor.startedAt) - 60_000).toISOString(),
        startedAt: now,
        page: 1,
      };
  await Repo.progress(
    organizationId,
    connectionId,
    row.sync.cursor,
    JSON.stringify(next),
    result.imported,
  );
  if (
    row.sync.confirmationTemplateId &&
    row.sync.confirmationSenderId &&
    row.sync.confirmationStartedAt &&
    modules.some((m) => m.moduleKey === "whatsapp" && m.status === "enabled")
  ) {
    const sender = await OrderOperationsRepository.sender(
      organizationId,
      row.sync.confirmationSenderId,
    );
    const template = await CommunicationsRepository.getWhatsappTemplate(
      organizationId,
      row.sync.confirmationTemplateId,
    );
    if (
      sender?.provider === "twilio" &&
      sender.status === "connected" &&
      template?.connectionId === sender.id &&
      template.externalTemplateId
    ) {
      const verified = await fetchOrderConfirmationTemplate(
        sender,
        template.externalTemplateId,
      );
      if (
        verified.body !== template.body ||
        verified.languageCode !== template.languageCode
      )
        throw new AppError(
          "CONFLICT",
          "The provider template wording changed. Save confirmation settings again.",
        );
      if (verified.status !== template.status)
        await CommunicationsRepository.updateWhatsappTemplate(
          organizationId,
          template.id,
          { status: verified.status },
        );
      if (verified.status === "approved")
        await OrderOperationsService.runDueConfirmations(
          organizationId,
          connectionId,
        );
    }
  }
  return true;
}
export const WooOrderService = {
  settings,
  enable,
  configureConfirmation,
  importHistory,
  sync,
};

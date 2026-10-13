import { orderDecisionSchema } from "@/types/schemas/orderReview";
import { orderWebhookSecretSchema } from "@/types/schemas/orderReview";
import { LegacyOrderService } from "@/server/features/commerce/services/LegacyOrderService";
import { legacyOrderImportSchema } from "@/types/schemas/orderReview";
import { OrderShipmentService } from "@/server/features/commerce/services/OrderShipmentService";
import {
  orderShipmentSchema,
  courierSettingsSchema,
} from "@/types/schemas/orderReview";
import { ShopifyOrderService } from "@/server/features/commerce/services/ShopifyOrderService";
import {
  orderSyncSchema,
  orderImportSchema,
  orderReviewSchema,
} from "@/types/schemas/orderReview";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuthenticatedContext } from "./middleware";
import { OrderService } from "@/server/features/commerce/services/OrderService";
export const getOrderSyncSettings = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) =>
    ShopifyOrderService.settings(context.organizationId, context.userId),
  );
export const setOrderSyncEnabled = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(orderSyncSchema)
  .handler(({ context, data }) =>
    ShopifyOrderService.enable(
      context.organizationId,
      context.userId,
      data.connectionId,
      data.enabled,
    ),
  );
export const importShopifyOrders = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(orderImportSchema)
  .handler(({ context, data }) =>
    ShopifyOrderService.importPage(
      context.organizationId,
      context.userId,
      data.connectionId,
      data.restart,
    ),
  );
export const approveImportedOrder = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(orderReviewSchema)
  .handler(({ context, data }) =>
    OrderService.approveImportedOrder(
      context.organizationId,
      context.userId,
      data,
    ),
  );

export const linkOrderShipment = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(orderShipmentSchema)
  .handler(({ context, data }) =>
    OrderShipmentService.link(context.organizationId, context.userId, data),
  );
export const configureOrderCourier = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(courierSettingsSchema)
  .handler(({ context, data }) =>
    OrderShipmentService.configure(
      context.organizationId,
      context.userId,
      data.connectionId,
      data.apiKey,
    ),
  );
export const refreshOrderShipment = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(
    z.object({ orderId: z.string().min(1), shipmentId: z.string().min(1) }),
  )
  .handler(({ context, data }) =>
    OrderShipmentService.refresh(
      context.organizationId,
      context.userId,
      data.orderId,
      data.shipmentId,
    ),
  );

export const importLegacyOrders = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(legacyOrderImportSchema)
  .handler(({ context, data }) =>
    LegacyOrderService.importPage(context.organizationId, context.userId, data),
  );

export const getOrderSequence = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) =>
    OrderService.missingSequence(context.organizationId, context.userId),
  );

export const configureOrderWebhook = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(orderWebhookSecretSchema)
  .handler(({ context, data }) =>
    ShopifyOrderService.configureWebhook(
      context.organizationId,
      context.userId,
      data.connectionId,
      data.secret,
    ),
  );

export const rejectImportedOrder = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(orderDecisionSchema)
  .handler(({ context, data }) =>
    OrderService.rejectImportedOrder(
      context.organizationId,
      context.userId,
      data.orderId,
      data.revision,
    ),
  );

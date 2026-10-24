import { createServerFn } from "@tanstack/react-start";
import { requireAuthenticatedContext } from "./middleware";
import {
  wooEnableSchema,
  wooConfirmationSchema,
  wooImportSchema,
} from "@/types/schemas/wooOrders";
import { WooOrderService } from "@/server/features/commerce/services/WooOrderService";

export const getWooOrderSettings = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) =>
    WooOrderService.settings(context.organizationId, context.userId),
  );
export const enableWooOrders = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(wooEnableSchema)
  .handler(({ context, data }) =>
    WooOrderService.enable(
      context.organizationId,
      context.userId,
      data.connectionId,
      data.enabled,
    ),
  );
export const configureWooConfirmation = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(wooConfirmationSchema)
  .handler(({ context, data }) =>
    WooOrderService.configureConfirmation(
      context.organizationId,
      context.userId,
      data,
    ),
  );
export const importWooOrderHistory = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(wooImportSchema)
  .handler(({ context, data }) =>
    WooOrderService.importHistory(
      context.organizationId,
      context.userId,
      data.connectionId,
      data.page,
    ),
  );

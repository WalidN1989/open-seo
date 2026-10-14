import {
  orderHistorySchema,
  orderGapAnnotationSchema,
} from "@/types/schemas/orderHistory";
import { OrderReturnsService } from "@/server/features/commerce/services/OrderReturnsService";
import { OrderGapService } from "@/server/features/commerce/services/OrderGapService";
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireAuthenticatedContext } from "./middleware";
import { listOrdersSchema } from "@/types/schemas/commerce";
import { OrderWorkspaceService } from "@/server/features/commerce/services/OrderWorkspaceService";
export const getOrderWorkspace = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .validator(listOrdersSchema)
  .handler(({ context, data }) =>
    OrderWorkspaceService.page(context.organizationId, context.userId, data),
  );

export const getOrderCustomers = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .validator(z.object({ search: z.string().trim().max(200).default("") }))
  .handler(({ context, data }) =>
    OrderWorkspaceService.customers(
      context.organizationId,
      context.userId,
      data.search,
    ),
  );

export const getOrderCustomerHistory = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .validator(z.object({ contactId: z.string().min(1) }))
  .handler(({ context, data }) =>
    OrderWorkspaceService.customerHistory(
      context.organizationId,
      context.userId,
      data.contactId,
    ),
  );

export const getOrderReturnHistory = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .validator(orderHistorySchema)
  .handler(({ context, data }) =>
    OrderReturnsService.history(context.organizationId, context.userId, data),
  );
export const getOrderGapOverview = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) =>
    OrderGapService.overview(context.organizationId, context.userId),
  );
export const annotateOrderGap = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(orderGapAnnotationSchema)
  .handler(({ context, data }) =>
    OrderGapService.annotate(
      context.organizationId,
      context.userId,
      data.orderNumber,
      data.marked,
    ),
  );

import { createServerFn } from "@tanstack/react-start";
import { CommerceService } from "@/server/features/commerce/services/CommerceService";
import { InventoryService } from "@/server/features/commerce/services/InventoryService";
import { OrderService } from "@/server/features/commerce/services/OrderService";
import { CatalogueSyncService } from "@/server/features/commerce/services/CatalogueSyncService";
import { AnalyticsService } from "@/server/features/commerce/services/AnalyticsService";
import { BusinessSettingsService } from "@/server/features/business-modules/services/BusinessSettingsService";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";
import {
  adjustStockSchema,
  auditIdSchema,
  connectionIdSchema,
  convertOrderRequestSchema,
  createAuditSchema,
  createOrderSchema,
  createProductSchema,
  listMovementsSchema,
  listOrdersSchema,
  orderIdSchema,
  recordAuditCountSchema,
  setSyncScheduleSchema,
  listProductsSchema,
  analyticsOverviewSchema,
  setCurrencySchema,
  productIdSchema,
  updateProductSchema,
} from "@/types/schemas/commerce";

export const getBusinessAnalytics = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .validator(analyticsOverviewSchema)
  .handler(({ context, data }) =>
    AnalyticsService.getOverview(context.organizationId, context.userId, data),
  );

export const getBusinessSettings = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) =>
    BusinessSettingsService.getSettings(context.organizationId, context.userId),
  );

export const setBusinessCurrency = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(setCurrencySchema)
  .handler(({ context, data }) =>
    BusinessSettingsService.setCurrency(
      context.organizationId,
      context.userId,
      data,
    ),
  );

export const listCommerceProducts = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .validator(listProductsSchema)
  .handler(({ context, data }) =>
    CommerceService.listProducts(context.organizationId, context.userId, data),
  );

export const getCommerceProduct = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .validator(productIdSchema)
  .handler(({ context, data }) =>
    CommerceService.getProduct(context.organizationId, context.userId, data.id),
  );

export const createCommerceProduct = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(createProductSchema)
  .handler(({ context, data }) =>
    CommerceService.createProduct(context.organizationId, context.userId, data),
  );

export const updateCommerceProduct = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(updateProductSchema)
  .handler(({ context, data }) =>
    CommerceService.updateProduct(context.organizationId, context.userId, data),
  );

export const getInventoryOverview = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) =>
    InventoryService.getStockOverview(context.organizationId, context.userId),
  );

export const listStockMovements = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .validator(listMovementsSchema)
  .handler(({ context, data }) =>
    InventoryService.listMovements(
      context.organizationId,
      context.userId,
      data,
    ),
  );

export const adjustProductStock = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(adjustStockSchema)
  .handler(({ context, data }) =>
    InventoryService.adjustStock(context.organizationId, context.userId, data),
  );

export const listInventoryAudits = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) =>
    InventoryService.listAudits(context.organizationId, context.userId),
  );

export const getInventoryAudit = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .validator(auditIdSchema)
  .handler(({ context, data }) =>
    InventoryService.getAudit(
      context.organizationId,
      context.userId,
      data.auditId,
    ),
  );

export const createInventoryAudit = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(createAuditSchema)
  .handler(({ context, data }) =>
    InventoryService.createAudit(context.organizationId, context.userId, data),
  );

export const recordInventoryAuditCount = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(recordAuditCountSchema)
  .handler(({ context, data }) =>
    InventoryService.recordAuditCount(
      context.organizationId,
      context.userId,
      data,
    ),
  );

export const publishInventoryAudit = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(auditIdSchema)
  .handler(({ context, data }) =>
    InventoryService.publishAudit(
      context.organizationId,
      context.userId,
      data.auditId,
    ),
  );

export const revertInventoryAudit = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(auditIdSchema)
  .handler(({ context, data }) =>
    InventoryService.revertAudit(
      context.organizationId,
      context.userId,
      data.auditId,
    ),
  );

export const listCommerceOrders = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .validator(listOrdersSchema)
  .handler(({ context, data }) =>
    OrderService.listOrders(context.organizationId, context.userId, data),
  );

export const getCommerceOrder = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .validator(orderIdSchema)
  .handler(({ context, data }) =>
    OrderService.getOrder(context.organizationId, context.userId, data.orderId),
  );

export const createCommerceOrder = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(createOrderSchema)
  .handler(({ context, data }) =>
    OrderService.createOrder(context.organizationId, context.userId, data),
  );

export const confirmCommerceOrder = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(orderIdSchema)
  .handler(({ context, data }) =>
    OrderService.confirmOrder(
      context.organizationId,
      context.userId,
      data.orderId,
    ),
  );

export const cancelCommerceOrder = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(orderIdSchema)
  .handler(({ context, data }) =>
    OrderService.cancelOrder(
      context.organizationId,
      context.userId,
      data.orderId,
    ),
  );

export const returnCommerceOrder = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(orderIdSchema)
  .handler(({ context, data }) =>
    OrderService.returnOrder(
      context.organizationId,
      context.userId,
      data.orderId,
    ),
  );

export const convertWhatsappOrderRequest = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(convertOrderRequestSchema)
  .handler(({ context, data }) =>
    OrderService.convertOrderRequest(
      context.organizationId,
      context.userId,
      data,
    ),
  );

export const checkIntegrationHealth = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(connectionIdSchema)
  .handler(({ context, data }) =>
    CatalogueSyncService.checkHealth(
      context.organizationId,
      context.userId,
      data.connectionId,
    ),
  );

export const syncIntegrationCatalogue = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(connectionIdSchema)
  .handler(async ({ context, data }) => {
    // Queue then run: the row shows "running" immediately, and the scheduler
    // would pick it up anyway if this request died mid-flight.
    await CatalogueSyncService.queueSync(
      context.organizationId,
      context.userId,
      data.connectionId,
    );
    return CatalogueSyncService.runSync(
      context.organizationId,
      data.connectionId,
    );
  });

export const setIntegrationSyncSchedule = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(setSyncScheduleSchema)
  .handler(({ context, data }) =>
    CatalogueSyncService.setSchedule(
      context.organizationId,
      context.userId,
      data,
    ),
  );

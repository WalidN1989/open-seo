import { createServerFn } from "@tanstack/react-start";
import { CommerceService } from "@/server/features/commerce/services/CommerceService";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";
import {
  createProductSchema,
  listProductsSchema,
  productIdSchema,
  updateProductSchema,
} from "@/types/schemas/commerce";

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

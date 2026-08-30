import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { AppError } from "@/server/lib/errors";
import type {
  CreateProductInput,
  ListProductsInput,
  UpdateProductInput,
} from "@/types/schemas/commerce";
import { CommerceRepository } from "../repositories/CommerceRepository";

/**
 * Commerce is a CRM capability, so it is gated on the CRM module rather than
 * an entitlement of its own. Reading needs "view"; anything that writes needs
 * "manage".
 */
async function listProducts(
  organizationId: string,
  userId: string,
  input: ListProductsInput,
) {
  await BusinessModuleService.requireAccess(organizationId, userId, "crm");
  return CommerceRepository.listProducts(organizationId, input);
}

async function getProduct(
  organizationId: string,
  userId: string,
  productId: string,
) {
  await BusinessModuleService.requireAccess(organizationId, userId, "crm");
  const product = await CommerceRepository.getProduct(
    organizationId,
    productId,
  );
  if (!product) throw new AppError("NOT_FOUND");
  const variants = await CommerceRepository.listVariants(
    organizationId,
    product.id,
  );
  return { product, variants };
}

async function createProduct(
  organizationId: string,
  userId: string,
  input: CreateProductInput,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "crm",
    "manage",
  );

  // Checked before insert so the caller gets a useful message rather than a
  // raw unique-constraint violation. The index is still the guarantee.
  const existing = await CommerceRepository.findProductBySku(
    organizationId,
    input.sku,
  );
  if (existing) {
    throw new AppError("CONFLICT", `A product with SKU ${input.sku} exists.`);
  }

  await assertParentBelongsToOrganization(
    organizationId,
    input.parentProductId,
  );
  return CommerceRepository.createProduct(organizationId, input);
}

async function updateProduct(
  organizationId: string,
  userId: string,
  input: UpdateProductInput,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "crm",
    "manage",
  );

  if (input.sku) {
    const existing = await CommerceRepository.findProductBySku(
      organizationId,
      input.sku,
    );
    if (existing && existing.id !== input.id) {
      throw new AppError("CONFLICT", `A product with SKU ${input.sku} exists.`);
    }
  }

  if (input.parentProductId) {
    // A product cannot be its own parent, which would make the variant tree
    // cyclic and the parent lookup non-terminating.
    if (input.parentProductId === input.id) {
      throw new AppError(
        "VALIDATION_ERROR",
        "A product cannot be its own variant.",
      );
    }
    await assertParentBelongsToOrganization(
      organizationId,
      input.parentProductId,
    );
  }

  const updated = await CommerceRepository.updateProduct(organizationId, input);
  if (!updated) throw new AppError("NOT_FOUND");
  return updated;
}

/**
 * A variant may only point at a product in the same organization. Without this
 * a caller could attach their variant to another tenant's product id and read
 * its name back through the parent join.
 */
async function assertParentBelongsToOrganization(
  organizationId: string,
  parentProductId: string | null | undefined,
) {
  if (!parentProductId) return;
  const parent = await CommerceRepository.getProduct(
    organizationId,
    parentProductId,
  );
  if (!parent) throw new AppError("NOT_FOUND", "Parent product not found.");
}

export const CommerceService = {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
};

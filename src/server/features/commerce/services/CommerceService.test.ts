import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAccess: vi.fn(),
  listProducts: vi.fn(),
  getProduct: vi.fn(),
  findProductBySku: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  listVariants: vi.fn(),
}));

vi.mock(
  "@/server/features/business-modules/services/BusinessModuleService",
  () => ({
    BusinessModuleService: { requireAccess: mocks.requireAccess },
  }),
);
vi.mock("../repositories/CommerceRepository", () => ({
  CommerceRepository: {
    listProducts: mocks.listProducts,
    getProduct: mocks.getProduct,
    findProductBySku: mocks.findProductBySku,
    createProduct: mocks.createProduct,
    updateProduct: mocks.updateProduct,
    listVariants: mocks.listVariants,
  },
}));

const { CommerceService } = await import("./CommerceService");

const ORG = "org_1";
const USER = "user_1";

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: "product_1",
    organizationId: ORG,
    sku: "SKU-1",
    name: "Book",
    salePriceMinor: 1999,
    ...overrides,
  };
}

describe("CommerceService authorization", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.requireAccess.mockResolvedValue(undefined);
    mocks.listVariants.mockResolvedValue([]);
  });

  it("requires only view access to read", async () => {
    mocks.listProducts.mockResolvedValue([]);
    await CommerceService.listProducts(ORG, USER, { limit: 100 });
    // No permission argument means the default, "view".
    expect(mocks.requireAccess).toHaveBeenCalledWith(ORG, USER, "crm");
  });

  it("requires manage access to write", async () => {
    mocks.findProductBySku.mockResolvedValue(null);
    mocks.createProduct.mockResolvedValue(product());
    await CommerceService.createProduct(ORG, USER, {
      name: "Book",
      sku: "SKU-1",
      salePriceMinor: 1999,
      reorderThreshold: 0,
      status: "active",
    });
    expect(mocks.requireAccess).toHaveBeenCalledWith(
      ORG,
      USER,
      "crm",
      "manage",
    );
  });

  it("does not write when access is refused", async () => {
    mocks.requireAccess.mockRejectedValue(new Error("FORBIDDEN"));
    await expect(
      CommerceService.createProduct(ORG, USER, {
        name: "Book",
        sku: "SKU-1",
        salePriceMinor: 1999,
        reorderThreshold: 0,
        status: "active",
      }),
    ).rejects.toThrow();
    expect(mocks.createProduct).not.toHaveBeenCalled();
  });
});

describe("CommerceService organization isolation", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.requireAccess.mockResolvedValue(undefined);
    mocks.listVariants.mockResolvedValue([]);
  });

  it("passes the caller's organization to every lookup", async () => {
    mocks.getProduct.mockResolvedValue(product());
    await CommerceService.getProduct(ORG, USER, "product_1");
    expect(mocks.getProduct).toHaveBeenCalledWith(ORG, "product_1");
    expect(mocks.listVariants).toHaveBeenCalledWith(ORG, "product_1");
  });

  it("reports another tenant's product as not found", async () => {
    // The repository scopes by organization, so a foreign id resolves to null.
    mocks.getProduct.mockResolvedValue(null);
    await expect(
      CommerceService.getProduct(ORG, USER, "product_from_other_org"),
    ).rejects.toThrow("NOT_FOUND");
  });

  it("refuses a parent product from another organization", async () => {
    mocks.findProductBySku.mockResolvedValue(null);
    mocks.getProduct.mockResolvedValue(null);
    await expect(
      CommerceService.createProduct(ORG, USER, {
        name: "Variant",
        sku: "SKU-2",
        parentProductId: "product_from_other_org",
        salePriceMinor: 500,
        reorderThreshold: 0,
        status: "active",
      }),
    ).rejects.toThrow("Parent product not found.");
    expect(mocks.createProduct).not.toHaveBeenCalled();
  });

  it("refuses an update naming another tenant's row", async () => {
    // updateProduct scopes by organization in its WHERE, so it matches nothing.
    mocks.updateProduct.mockResolvedValue(null);
    await expect(
      CommerceService.updateProduct(ORG, USER, {
        id: "product_from_other_org",
        name: "Renamed",
      }),
    ).rejects.toThrow("NOT_FOUND");
  });
});

describe("CommerceService product rules", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.requireAccess.mockResolvedValue(undefined);
    mocks.listVariants.mockResolvedValue([]);
  });

  it("refuses a duplicate SKU within the organization", async () => {
    mocks.findProductBySku.mockResolvedValue(product());
    await expect(
      CommerceService.createProduct(ORG, USER, {
        name: "Another",
        sku: "SKU-1",
        salePriceMinor: 100,
        reorderThreshold: 0,
        status: "active",
      }),
    ).rejects.toThrow("A product with SKU SKU-1 exists.");
  });

  it("allows a product to keep its own SKU on update", async () => {
    mocks.findProductBySku.mockResolvedValue(product({ id: "product_1" }));
    mocks.updateProduct.mockResolvedValue(product({ name: "Renamed" }));
    await expect(
      CommerceService.updateProduct(ORG, USER, {
        id: "product_1",
        sku: "SKU-1",
        name: "Renamed",
      }),
    ).resolves.toMatchObject({ name: "Renamed" });
  });

  it("refuses a product that would be its own variant", async () => {
    await expect(
      CommerceService.updateProduct(ORG, USER, {
        id: "product_1",
        parentProductId: "product_1",
      }),
    ).rejects.toThrow("A product cannot be its own variant.");
    expect(mocks.updateProduct).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  branch: vi.fn(),
  products: vi.fn(),
  find: vi.fn(),
  create: vi.fn(),
  audit: vi.fn(),
  log: vi.fn(),
}));
vi.mock(
  "@/server/features/business-modules/services/BusinessModuleService",
  () => ({ BusinessModuleService: { requireAccess: mocks.access } }),
);
vi.mock(
  "@/server/features/business-modules/repositories/BusinessAuditRepository",
  () => ({ BusinessAuditRepository: { record: mocks.log } }),
);
vi.mock("../repositories/BranchRepository", () => ({
  BranchRepository: { resolve: mocks.branch },
}));
vi.mock("../repositories/CommerceRepository", () => ({
  CommerceRepository: {
    findProductIdsBySkus: mocks.find,
    createProducts: mocks.create,
  },
}));
vi.mock("../repositories/InventoryRepository", () => ({
  InventoryRepository: {
    listCountableProducts: mocks.products,
    createImportedAudit: mocks.audit,
  },
}));
import { StockImportService } from "./StockImportService";
const product = {
  id: "owned",
  sku: "P1",
  name: "Shoe",
  barcode: null,
  quantityOnHand: 5,
};
const input = {
  csv: "SKU,Name,Counted\nP1,Shoe,2",
  branchId: "branch",
  createMissingProducts: false,
  fileName: "count.csv",
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.branch.mockResolvedValue({ id: "branch" });
  mocks.products.mockResolvedValue([product]);
  mocks.find.mockResolvedValue(new Map());
  mocks.audit.mockResolvedValue({ id: "audit" });
});
describe("stock import authorization and audit", () => {
  it("checks manage permission before reading or writing", async () => {
    mocks.access.mockRejectedValue(new Error("FORBIDDEN"));
    await expect(
      StockImportService.importCounts("org", "user", input),
    ).rejects.toThrow("FORBIDDEN");
    expect(mocks.branch).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("writes counts scoped to the owned organization and selected branch without publishing", async () => {
    await expect(
      StockImportService.importCounts("org", "user", input),
    ).resolves.toMatchObject({ counted: 1, created: 0 });
    expect(mocks.products).toHaveBeenCalledWith("org", "branch");
    expect(mocks.audit).toHaveBeenCalledWith(
      "org",
      expect.objectContaining({ branchId: "branch" }),
      [{ productId: "owned", expectedQuantity: 5, countedQuantity: 2 }],
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("does not create missing products without an explicit choice", async () => {
    mocks.products.mockResolvedValue([]);
    await expect(
      StockImportService.importCounts("org", "user", input),
    ).rejects.toThrow("products are missing");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("creates missing products once, then resolves counts against the refreshed catalogue", async () => {
    mocks.products.mockResolvedValueOnce([]).mockResolvedValueOnce([product]);
    await StockImportService.importCounts("org", "user", {
      ...input,
      createMissingProducts: true,
    });
    expect(mocks.create).toHaveBeenCalledWith("org", [
      expect.objectContaining({
        sku: "P1",
        inventoryMode: "multi",
        salePriceMinor: 0,
      }),
    ]);
    expect(mocks.audit).toHaveBeenCalledTimes(1);
  });
  it("refuses foreign product IDs, rather than creating a substitute", async () => {
    await expect(
      StockImportService.importCounts("org", "user", {
        ...input,
        csv: "Product ID,SKU,Name,Counted\nforeign,P2,Shoe,2",
        createMissingProducts: true,
      }),
    ).rejects.toThrow("Cannot create");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("does not duplicate inactive or single-branch products", async () => {
    mocks.products.mockResolvedValue([]);
    mocks.find.mockResolvedValue(new Map([["P1", "inactive"]]));
    await expect(
      StockImportService.importCounts("org", "user", {
        ...input,
        createMissingProducts: true,
      }),
    ).rejects.toThrow("Cannot create");
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("rejects identifiers that point at two different products", async () => {
    mocks.products.mockResolvedValue([
      product,
      { ...product, id: "second", sku: "P2", barcode: "B2" },
    ]);
    await expect(
      StockImportService.importCounts("org", "user", {
        ...input,
        csv: "SKU,Barcode,Counted\nP1,B2,2",
      }),
    ).rejects.toThrow("Conflicting identifiers");
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});

it("rejects a foreign ID even when another column names an owned product", async () => {
  await expect(
    StockImportService.importCounts("org", "user", {
      ...input,
      csv: "Product ID,SKU,Counted\nforeign,P1,2",
    }),
  ).rejects.toThrow("must refer to the same product");
  expect(mocks.audit).not.toHaveBeenCalled();
});

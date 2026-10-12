import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  find: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
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
vi.mock("../repositories/CommerceRepository", () => ({
  CommerceRepository: {
    findProductIdsBySkus: mocks.find,
    createProducts: mocks.create,
    updateProduct: mocks.update,
  },
}));
import { ProductImportService } from "./ProductImportService";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.find.mockResolvedValue(new Map([["P1", "existing"]]));
  mocks.create.mockImplementation(
    (_org: string, rows: unknown[]) => rows.length,
  );
});
it("uses stock report aliases and preserves a price not supplied in the report", async () => {
  await ProductImportService.importProducts(
    "org",
    "user",
    "Item Code,Item Name,Current Stock\np1,Shoe,5",
  );
  expect(mocks.update).toHaveBeenCalledWith(
    "org",
    expect.objectContaining({
      id: "existing",
      name: "Shoe",
      salePriceMinor: undefined,
    }),
  );
  expect(mocks.create).not.toHaveBeenCalled();
});
it("creates new products without pretending the file supplied a selling price", async () => {
  await ProductImportService.importProducts("org", "user", "name,sku\nShoe,P2");
  expect(mocks.create).toHaveBeenCalledWith("org", [
    expect.objectContaining({ sku: "P2", salePriceMinor: 0 }),
  ]);
});
it("still permits an explicit zero price update", async () => {
  await ProductImportService.importProducts(
    "org",
    "user",
    "name,sku,price\nShoe,P1,0",
  );
  expect(mocks.update).toHaveBeenCalledWith(
    "org",
    expect.objectContaining({ salePriceMinor: 0 }),
  );
});

import { beforeAll, afterAll, expect, it, vi } from "vitest";
import type * as RepositoryModule from "@/server/features/commerce/repositories/InventoryRepository";
import {
  createTenancyFixture,
  ORG_A,
  ORG_B,
  USER_OWNER_A,
  USER_OWNER_B,
} from "./fixture";
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
let fixture: Awaited<ReturnType<typeof createTenancyFixture>>;
let repository: typeof RepositoryModule.InventoryRepository;
let second: string;
beforeAll(async () => {
  fixture = await createTenancyFixture();
  vi.doMock("@/db", () => ({ db: fixture.db }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: fixture.db }));
  vi.doMock("@/db/pg/client", () => ({ pgDb: null }));
  ({ InventoryRepository: repository } =
    await import("@/server/features/commerce/repositories/InventoryRepository"));
  const { BranchService } =
    await import("@/server/features/commerce/services/BranchService");
  second = (await BranchService.save(ORG_A, USER_OWNER_A, { name: "Branch B" }))
    .id;
});
afterAll(() => fixture?.client.close());

it("imports a stock report into linked products and a branch-scoped draft, leaving balances untouched", async () => {
  const { StockImportService } =
    await import("@/server/features/commerce/services/StockImportService");
  const csv = [
    "Item Code,Item Name,Location,Current Stock",
    ...Array.from(
      { length: 61 },
      (_, i) => `IMPORT-${i},Shoe ${i},Branch B,${i === 0 ? 0 : 2}`,
    ),
  ].join("\n");
  const result = await StockImportService.importCounts(ORG_A, USER_OWNER_A, {
    csv,
    branchId: second,
    fileName: "stock.xlsx",
    createMissingProducts: true,
  });
  expect(result).toMatchObject({ counted: 61, created: 61 });
  const audit = await repository.getAudit(ORG_A, result.auditId);
  expect(audit).toMatchObject({ branchId: second, status: "draft" });
  const items = await repository.listAuditItems(ORG_A, result.auditId);
  expect(items).toHaveLength(61);
  expect(items.every(({ item }) => item.expectedQuantity === 0)).toBe(true);
  expect(items.filter(({ item }) => item.countedQuantity === 0)).toHaveLength(
    1,
  );
  const listed = await repository.listCountableProducts(ORG_A, second);
  expect(
    listed
      .filter((row) => row.sku.startsWith("IMPORT-"))
      .every((row) => row.quantityOnHand === 0),
  ).toBe(true);
  const repeated = await StockImportService.importCounts(ORG_A, USER_OWNER_A, {
    csv,
    branchId: second,
    fileName: "stock.xlsx",
    createMissingProducts: true,
  });
  expect(repeated.created).toBe(0);
  expect(await repository.getAudit(ORG_B, result.auditId)).toBeNull();
  await expect(
    StockImportService.importCounts(ORG_B, USER_OWNER_B, {
      csv,
      branchId: second,
      fileName: "stock.xlsx",
      createMissingProducts: true,
    }),
  ).rejects.toThrow();
});

it("does not leave a partial import audit when a count row fails", async () => {
  const before = await repository.listAudits(ORG_A, 1000, second);
  await expect(
    repository.createImportedAudit(
      ORG_A,
      {
        branchId: second,
        createdByUserId: USER_OWNER_A,
        name: "Invalid",
        note: "Test",
      },
      [
        {
          productId: "missing-product",
          countedQuantity: 2,
          expectedQuantity: 0,
        },
      ],
    ),
  ).rejects.toThrow();
  const after = await repository.listAudits(ORG_A, 1000, second);
  expect(after).toHaveLength(before.length);
});

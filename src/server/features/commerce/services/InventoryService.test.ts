import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAccess: vi.fn(),
  getProduct: vi.fn(),
  getBalance: vi.fn(),
  listBalances: vi.fn(),
  listLowStock: vi.fn(),
  listMovements: vi.fn(),
  findMovementByReference: vi.fn(),
  applyMovements: vi.fn(),
  createAudit: vi.fn(),
  listAudits: vi.fn(),
  getAudit: vi.fn(),
  listAuditItems: vi.fn(),
  upsertAuditItem: vi.fn(),
  setAuditStatus: vi.fn(),
}));

vi.mock(
  "@/server/features/business-modules/services/BusinessModuleService",
  () => ({
    BusinessModuleService: { requireAccess: mocks.requireAccess },
  }),
);
vi.mock("../repositories/CommerceRepository", () => ({
  CommerceRepository: { getProduct: mocks.getProduct },
}));
vi.mock("../repositories/InventoryRepository", () => ({
  InventoryRepository: {
    getBalance: mocks.getBalance,
    listBalances: mocks.listBalances,
    listLowStock: mocks.listLowStock,
    listMovements: mocks.listMovements,
    findMovementByReference: mocks.findMovementByReference,
    applyMovements: mocks.applyMovements,
    createAudit: mocks.createAudit,
    listAudits: mocks.listAudits,
    getAudit: mocks.getAudit,
    listAuditItems: mocks.listAuditItems,
    upsertAuditItem: mocks.upsertAuditItem,
    setAuditStatus: mocks.setAuditStatus,
  },
}));

const { InventoryService } = await import("./InventoryService");

const ORG = "org_1";
const USER = "user_1";

function auditItem(expected: number, counted: number, productId = "p1") {
  return {
    item: { productId, expectedQuantity: expected, countedQuantity: counted },
    product: { id: productId, name: "Book" },
  };
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.requireAccess.mockResolvedValue(undefined);
  mocks.getProduct.mockResolvedValue({ id: "p1", organizationId: ORG });
  mocks.applyMovements.mockResolvedValue(undefined);
  mocks.findMovementByReference.mockResolvedValue(null);
  mocks.listBalances.mockResolvedValue([]);
  mocks.setAuditStatus.mockImplementation(
    (_org: string, id: string, status: string) => ({ id, status }),
  );
});

describe("stock invariants", () => {
  it("refuses a movement that would take stock below zero", async () => {
    mocks.listBalances.mockResolvedValue([
      { productId: "p1", quantityOnHand: 2 },
    ]);
    await expect(
      InventoryService.adjustStock(ORG, USER, {
        productId: "p1",
        quantityDelta: -3,
      }),
    ).rejects.toThrow("This would take stock below zero.");
    expect(mocks.applyMovements).not.toHaveBeenCalled();
  });

  it("allows a movement that lands exactly on zero", async () => {
    mocks.listBalances.mockResolvedValue([
      { productId: "p1", quantityOnHand: 2 },
    ]);
    mocks.getBalance.mockResolvedValue({ productId: "p1", quantityOnHand: 0 });
    await InventoryService.adjustStock(ORG, USER, {
      productId: "p1",
      quantityDelta: -2,
    });
    expect(mocks.applyMovements).toHaveBeenCalledTimes(1);
  });

  it("judges the whole publish together, not movement by movement", async () => {
    // Two lines on the same product: -5 then +4 nets to -1 against 0 on hand.
    // Checked individually the -5 would fail; checked together it still fails,
    // but the point is the net is what decides.
    mocks.getAudit.mockResolvedValue({ id: "a1", status: "draft", name: "A" });
    mocks.listAuditItems.mockResolvedValue([
      auditItem(5, 0, "p1"),
      auditItem(0, 4, "p2"),
    ]);
    mocks.listBalances.mockResolvedValue([
      { productId: "p1", quantityOnHand: 3 },
    ]);
    await expect(
      InventoryService.publishAudit(ORG, USER, "a1"),
    ).rejects.toThrow("This would take stock below zero.");
    expect(mocks.applyMovements).not.toHaveBeenCalled();
  });

  it("writes a movement rather than mutating a quantity", async () => {
    mocks.listBalances.mockResolvedValue([
      { productId: "p1", quantityOnHand: 10 },
    ]);
    mocks.getBalance.mockResolvedValue({ productId: "p1", quantityOnHand: 7 });
    await InventoryService.adjustStock(ORG, USER, {
      productId: "p1",
      quantityDelta: -3,
      reason: "Damaged",
    });
    expect(mocks.applyMovements).toHaveBeenCalledWith(ORG, [
      expect.objectContaining({
        productId: "p1",
        movementType: "adjustment",
        quantityDelta: -3,
        reason: "Damaged",
        actorUserId: USER,
      }),
    ]);
  });
});

describe("audit lifecycle", () => {
  it("turns each variance into one movement", async () => {
    mocks.getAudit.mockResolvedValue({ id: "a1", status: "draft", name: "A" });
    mocks.listAuditItems.mockResolvedValue([
      auditItem(10, 12, "p1"),
      auditItem(4, 4, "p2"),
    ]);
    const result = await InventoryService.publishAudit(ORG, USER, "a1");
    // The unchanged line writes nothing.
    expect(result.movementCount).toBe(1);
    expect(mocks.applyMovements).toHaveBeenCalledWith(ORG, [
      expect.objectContaining({ productId: "p1", quantityDelta: 2 }),
    ]);
  });

  it("captures the expected quantity at counting time", async () => {
    mocks.getAudit.mockResolvedValue({ id: "a1", status: "draft", name: "A" });
    mocks.getBalance.mockResolvedValue({ productId: "p1", quantityOnHand: 9 });
    await InventoryService.recordAuditCount(ORG, USER, {
      auditId: "a1",
      productId: "p1",
      countedQuantity: 7,
    });
    expect(mocks.upsertAuditItem).toHaveBeenCalledWith(ORG, {
      auditId: "a1",
      productId: "p1",
      expectedQuantity: 9,
      countedQuantity: 7,
    });
  });

  it("refuses to publish an audit twice", async () => {
    mocks.getAudit.mockResolvedValue({ id: "a1", status: "published" });
    await expect(
      InventoryService.publishAudit(ORG, USER, "a1"),
    ).rejects.toThrow("This audit has already been published.");
  });

  it("reverts with compensating movements, not deletions", async () => {
    mocks.getAudit.mockResolvedValue({
      id: "a1",
      status: "published",
      name: "A",
    });
    mocks.listAuditItems.mockResolvedValue([auditItem(10, 12, "p1")]);
    mocks.listBalances.mockResolvedValue([
      { productId: "p1", quantityOnHand: 12 },
    ]);
    await InventoryService.revertAudit(ORG, USER, "a1");
    expect(mocks.applyMovements).toHaveBeenCalledWith(ORG, [
      expect.objectContaining({ productId: "p1", quantityDelta: -2 }),
    ]);
  });

  it("refuses to revert an audit that was never published", async () => {
    mocks.getAudit.mockResolvedValue({ id: "a1", status: "draft" });
    await expect(InventoryService.revertAudit(ORG, USER, "a1")).rejects.toThrow(
      "Only a published audit can be reverted.",
    );
  });
});

describe("idempotency", () => {
  it("does not re-apply a variance already carrying this audit's reference", async () => {
    mocks.getAudit.mockResolvedValue({ id: "a1", status: "draft", name: "A" });
    mocks.listAuditItems.mockResolvedValue([auditItem(10, 12, "p1")]);
    // A previous publish attempt already wrote this movement.
    mocks.findMovementByReference.mockResolvedValue({ id: "m1" });

    const result = await InventoryService.publishAudit(ORG, USER, "a1");

    expect(result.movementCount).toBe(0);
    expect(mocks.applyMovements).toHaveBeenCalledWith(ORG, []);
  });

  it("does not revert the same audit twice", async () => {
    mocks.getAudit.mockResolvedValue({
      id: "a1",
      status: "published",
      name: "A",
    });
    mocks.listAuditItems.mockResolvedValue([auditItem(10, 12, "p1")]);
    mocks.findMovementByReference.mockResolvedValue({ id: "m1" });
    const result = await InventoryService.revertAudit(ORG, USER, "a1");
    expect(result.movementCount).toBe(0);
  });
});

describe("authorization and isolation", () => {
  it("requires manage access to move stock", async () => {
    mocks.listBalances.mockResolvedValue([
      { productId: "p1", quantityOnHand: 5 },
    ]);
    mocks.getBalance.mockResolvedValue({ productId: "p1", quantityOnHand: 6 });
    await InventoryService.adjustStock(ORG, USER, {
      productId: "p1",
      quantityDelta: 1,
    });
    expect(mocks.requireAccess).toHaveBeenCalledWith(
      ORG,
      USER,
      "crm",
      "manage",
    );
  });

  it("refuses to move stock for another tenant's product", async () => {
    mocks.getProduct.mockResolvedValue(null);
    await expect(
      InventoryService.adjustStock(ORG, USER, {
        productId: "product_from_other_org",
        quantityDelta: 1,
      }),
    ).rejects.toThrow("Product not found.");
    expect(mocks.applyMovements).not.toHaveBeenCalled();
  });

  it("reports another tenant's audit as not found", async () => {
    mocks.getAudit.mockResolvedValue(null);
    await expect(
      InventoryService.getAudit(ORG, USER, "audit_from_other_org"),
    ).rejects.toThrow("NOT_FOUND");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as woocommerceModule from "../providers/woocommerce";

const mocks = vi.hoisted(() => ({
  requireAccess: vi.fn(),
  getConnection: vi.fn(),
  recordHealth: vi.fn(),
  setSyncState: vi.fn(),
  setSchedule: vi.fn(),
  listDueSyncs: vi.fn(),
  upsertExternalProduct: vi.fn(),
  reconcileToQuantity: vi.fn(),
  applyMovements: vi.fn(),
  fetchStoreHealth: vi.fn(),
  fetchProductPage: vi.fn(),
}));

vi.mock(
  "@/server/features/business-modules/services/BusinessModuleService",
  () => ({
    BusinessModuleService: { requireAccess: mocks.requireAccess },
  }),
);
vi.mock("../repositories/IntegrationSyncRepository", () => ({
  IntegrationSyncRepository: {
    getConnection: mocks.getConnection,
    recordHealth: mocks.recordHealth,
    setSyncState: mocks.setSyncState,
    setSchedule: mocks.setSchedule,
    listDueSyncs: mocks.listDueSyncs,
  },
}));
vi.mock("../repositories/CommerceRepository", () => ({
  CommerceRepository: { upsertExternalProduct: mocks.upsertExternalProduct },
}));
vi.mock("../repositories/InventoryRepository", () => ({
  InventoryRepository: {
    reconcileToQuantity: mocks.reconcileToQuantity,
    applyMovements: mocks.applyMovements,
  },
}));
// toMinorUnits is the real implementation on purpose: its rounding is one of
// the things under test. Only the network calls are replaced.
vi.mock("../providers/woocommerce", async () => {
  const actual = await vi.importActual<typeof woocommerceModule>(
    "../providers/woocommerce",
  );
  return {
    ...actual,
    fetchStoreHealth: mocks.fetchStoreHealth,
    fetchProductPage: mocks.fetchProductPage,
  };
});

const { CatalogueSyncService } = await import("./CatalogueSyncService");
const { toMinorUnits } = await import("../providers/woocommerce");

const ORG = "org_1";
const USER = "user_1";
const CONNECTION = {
  id: "conn_1",
  organizationId: ORG,
  providerKey: "woocommerce",
  credentialReference: "booxworm",
  lastSyncedAt: null,
};

function wooProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 101,
    name: "The Blue Book",
    sku: "BLUE-1",
    price: "19.99",
    categories: [{ name: "Fiction" }],
    ...overrides,
  };
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.requireAccess.mockResolvedValue(undefined);
  mocks.getConnection.mockResolvedValue(CONNECTION);
  mocks.setSyncState.mockImplementation(
    (_org: string, _id: string, values: Record<string, unknown>) => values,
  );
  mocks.upsertExternalProduct.mockResolvedValue({ id: "product_1" });
  mocks.reconcileToQuantity.mockResolvedValue(null);
  mocks.applyMovements.mockResolvedValue(undefined);
  mocks.fetchProductPage.mockResolvedValue([]);
});

describe("price conversion", () => {
  it("converts a decimal price to integer minor units", () => {
    expect(toMinorUnits("19.99")).toBe(1999);
    expect(toMinorUnits("0.10")).toBe(10);
  });

  it("rounds rather than truncating a third decimal", () => {
    expect(toMinorUnits("19.995")).toBe(2000);
  });

  it("treats a missing or invalid price as zero, not NaN", () => {
    expect(toMinorUnits(null)).toBe(0);
    expect(toMinorUnits("")).toBe(0);
    expect(toMinorUnits("abc")).toBe(0);
    expect(toMinorUnits("-5")).toBe(0);
  });
});

describe("catalogue sync", () => {
  it("keys products on the provider id so a repeat run updates, not duplicates", async () => {
    mocks.fetchProductPage.mockResolvedValueOnce([wooProduct()]);
    await CatalogueSyncService.runSync(ORG, "conn_1");
    expect(mocks.upsertExternalProduct).toHaveBeenCalledWith(
      ORG,
      expect.objectContaining({
        externalSource: "woocommerce",
        externalId: "101",
        sku: "BLUE-1",
        salePriceMinor: 1999,
        category: "Fiction",
      }),
    );
  });

  it("falls back to a provider-derived SKU when the store has none", async () => {
    mocks.fetchProductPage.mockResolvedValueOnce([wooProduct({ sku: "" })]);
    await CatalogueSyncService.runSync(ORG, "conn_1");
    expect(mocks.upsertExternalProduct).toHaveBeenCalledWith(
      ORG,
      expect.objectContaining({ sku: "WOO-101" }),
    );
  });

  it("writes stock as a movement, not an assignment", async () => {
    mocks.fetchProductPage.mockResolvedValueOnce([
      wooProduct({ manage_stock: true, stock_quantity: 7 }),
    ]);
    mocks.reconcileToQuantity.mockResolvedValue(3);
    await CatalogueSyncService.runSync(ORG, "conn_1");
    expect(mocks.applyMovements).toHaveBeenCalledWith(ORG, [
      expect.objectContaining({
        productId: "product_1",
        movementType: "adjustment",
        quantityDelta: 3,
      }),
    ]);
  });

  it("writes nothing when the store already agrees with us", async () => {
    mocks.fetchProductPage.mockResolvedValueOnce([
      wooProduct({ manage_stock: true, stock_quantity: 7 }),
    ]);
    mocks.reconcileToQuantity.mockResolvedValue(null);
    await CatalogueSyncService.runSync(ORG, "conn_1");
    expect(mocks.applyMovements).toHaveBeenCalledWith(ORG, []);
  });

  it("ignores stock for a store that does not track it", async () => {
    mocks.fetchProductPage.mockResolvedValueOnce([
      wooProduct({ manage_stock: false, stock_quantity: 7 }),
    ]);
    await CatalogueSyncService.runSync(ORG, "conn_1");
    expect(mocks.reconcileToQuantity).not.toHaveBeenCalled();
  });

  it("records the failure instead of throwing at the scheduler", async () => {
    mocks.fetchProductPage.mockRejectedValue(new Error("store unreachable"));
    const result = await CatalogueSyncService.runSync(ORG, "conn_1");
    expect(result).toMatchObject({
      syncStatus: "error",
      syncError: "store unreachable",
    });
  });

  it("stops paging when a short page comes back", async () => {
    // A full page implies more; a short one is the end.
    mocks.fetchProductPage.mockResolvedValueOnce([wooProduct()]);
    await CatalogueSyncService.runSync(ORG, "conn_1");
    expect(mocks.fetchProductPage).toHaveBeenCalledTimes(1);
  });
});

describe("connection health", () => {
  it("records the store's product count", async () => {
    mocks.fetchStoreHealth.mockResolvedValue({ productCount: 1821 });
    await CatalogueSyncService.checkHealth(ORG, USER, "conn_1");
    expect(mocks.recordHealth).toHaveBeenCalledWith(ORG, "conn_1", {
      status: "connected",
      healthDetail: "1,821 products found in your store",
    });
  });

  it("records a failed check rather than throwing", async () => {
    mocks.fetchStoreHealth.mockRejectedValue(new Error("401 Unauthorized"));
    await CatalogueSyncService.checkHealth(ORG, USER, "conn_1");
    expect(mocks.recordHealth).toHaveBeenCalledWith(
      ORG,
      "conn_1",
      expect.objectContaining({ status: "error" }),
    );
  });
});

describe("authorization and isolation", () => {
  it("requires integrations manage access to sync", async () => {
    await CatalogueSyncService.queueSync(ORG, USER, "conn_1");
    expect(mocks.requireAccess).toHaveBeenCalledWith(
      ORG,
      USER,
      "integrations",
      "manage",
    );
  });

  it("reports another tenant's connection as not found", async () => {
    mocks.getConnection.mockResolvedValue(null);
    await expect(
      CatalogueSyncService.queueSync(ORG, USER, "conn_from_other_org"),
    ).rejects.toThrow("NOT_FOUND");
  });

  it("refuses catalogue sync for a provider that cannot do it", async () => {
    mocks.getConnection.mockResolvedValue({
      ...CONNECTION,
      providerKey: "hunter",
    });
    await expect(
      CatalogueSyncService.queueSync(ORG, USER, "conn_1"),
    ).rejects.toThrow("only available for WooCommerce");
  });
});

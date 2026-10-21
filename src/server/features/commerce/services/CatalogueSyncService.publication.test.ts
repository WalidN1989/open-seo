import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as woocommerceModule from "../providers/woocommerce";

const mocks = vi.hoisted(() => ({
  requireAccess: vi.fn(),
  getConnection: vi.fn(),
  recordHealth: vi.fn(),
  setSyncState:
    vi.fn<
      (
        organizationId: string,
        connectionId: string,
        values: Record<string, unknown>,
      ) => unknown
    >(),
  setSchedule: vi.fn(),
  listDueSyncs: vi.fn(),
  upsertExternalProduct: vi.fn(),
  archiveExternalProducts: vi.fn(),
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
  CommerceRepository: {
    upsertExternalProduct: mocks.upsertExternalProduct,
    archiveExternalProducts: mocks.archiveExternalProducts,
  },
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

const ORG = "org_1";
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
    status: "publish",
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

describe("WooCommerce publication reconciliation", () => {
  it("imports only published rows and retires all other source statuses without touching stock", async () => {
    mocks.fetchProductPage.mockResolvedValueOnce([
      wooProduct(),
      ...["draft", "pending", "private", "future", "trash"].map(
        (status, index) =>
          wooProduct({
            id: 200 + index,
            status,
            manage_stock: true,
            stock_quantity: 10,
          }),
      ),
    ]);
    await CatalogueSyncService.runSync(ORG, CONNECTION.id);
    expect(mocks.upsertExternalProduct).toHaveBeenCalledTimes(1);
    expect(mocks.upsertExternalProduct).toHaveBeenCalledWith(
      ORG,
      expect.objectContaining({ externalId: "101", status: "active" }),
    );
    expect(mocks.archiveExternalProducts).toHaveBeenCalledWith(
      ORG,
      "woocommerce",
      ["200", "201", "202", "203", "204"],
    );
    expect(mocks.reconcileToQuantity).not.toHaveBeenCalled();
    expect(mocks.applyMovements).not.toHaveBeenCalled();
    expect(mocks.setSyncState).toHaveBeenLastCalledWith(
      ORG,
      CONNECTION.id,
      expect.objectContaining({ syncedCount: 1, syncStatus: "idle" }),
    );
  });

  it("continues after an entirely unpublished page and counts only published imports", async () => {
    mocks.fetchProductPage
      .mockResolvedValueOnce(
        Array.from({ length: 50 }, (_, id) =>
          wooProduct({ id, status: "draft" }),
        ),
      )
      .mockResolvedValueOnce([wooProduct()]);
    await CatalogueSyncService.runSync(ORG, CONNECTION.id);
    expect(
      mocks.fetchProductPage.mock.calls.map((call) => Number(call[1])),
    ).toEqual([1, 2]);
    expect(mocks.upsertExternalProduct).toHaveBeenCalledTimes(1);
    expect(mocks.archiveExternalProducts).toHaveBeenCalledTimes(1);
    expect(mocks.setSyncState).toHaveBeenLastCalledWith(
      ORG,
      CONNECTION.id,
      expect.objectContaining({ syncedCount: 1, syncStatus: "idle" }),
    );
  });

  it("does not archive products on a failed provider request", async () => {
    mocks.fetchProductPage.mockRejectedValue(new Error("request failed"));
    await CatalogueSyncService.runSync(ORG, CONNECTION.id);
    expect(mocks.archiveExternalProducts).not.toHaveBeenCalled();
    expect(mocks.upsertExternalProduct).not.toHaveBeenCalled();
  });

  it("fails the page rather than claiming success when draft retirement fails", async () => {
    mocks.fetchProductPage.mockResolvedValueOnce([
      wooProduct({ status: "draft" }),
    ]);
    mocks.archiveExternalProducts.mockRejectedValue(new Error("write failed"));
    await CatalogueSyncService.runSync(ORG, CONNECTION.id);
    expect(mocks.setSyncState).toHaveBeenLastCalledWith(
      ORG,
      CONNECTION.id,
      expect.objectContaining({ syncStatus: "error", syncCursor: 0 }),
    );
  });
});

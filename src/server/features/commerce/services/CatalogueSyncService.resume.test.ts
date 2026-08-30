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

describe("surviving a run that dies part-way", () => {
  it("records the page before working on it, not after the run", async () => {
    // Checkpointing only at the end means a run killed by a restart leaves the
    // cursor at zero and starts from page one on every retry. A catalogue
    // bigger than one run then re-imports its first pages forever and never
    // finishes — which is exactly what happened in production.
    mocks.fetchProductPage.mockImplementation((_c: unknown, page: number) =>
      Promise.resolve(
        page <= 3
          ? Array.from({ length: 50 }, (_, index) =>
              wooProduct({ id: page * 100 + index, sku: `S-${page}-${index}` }),
            )
          : [],
      ),
    );
    await CatalogueSyncService.runSync(ORG, CONNECTION.id);

    const cursors = mocks.setSyncState.mock.calls
      .map((call) => call[2].syncCursor)
      .filter((value) => typeof value === "number");
    // One checkpoint per page attempted, in order, before the final write.
    expect(cursors.slice(0, 3)).toEqual([1, 2, 3]);
  });

  it("counts progress into the checkpoint so it survives too", async () => {
    mocks.fetchProductPage.mockImplementation((_c: unknown, page: number) =>
      Promise.resolve(
        page <= 2
          ? Array.from({ length: 50 }, (_, index) =>
              wooProduct({ id: page * 100 + index, sku: `S-${page}-${index}` }),
            )
          : [],
      ),
    );
    await CatalogueSyncService.runSync(ORG, CONNECTION.id);
    const counts = mocks.setSyncState.mock.calls
      .map((call) => call[2].syncedCount)
      .filter((value) => typeof value === "number");
    // Page two is checkpointed after page one's fifty are already counted.
    expect(counts).toContain(50);
  });

  it("resumes the running total from the checkpoint rather than recounting", async () => {
    mocks.getConnection.mockResolvedValue({
      ...CONNECTION,
      syncCursor: 4,
      syncedCount: 150,
    });
    mocks.fetchProductPage.mockImplementation((_c: unknown, page: number) =>
      Promise.resolve(page === 4 ? [wooProduct()] : []),
    );
    await CatalogueSyncService.runSync(ORG, CONNECTION.id);
    const calls = mocks.setSyncState.mock.calls;
    expect(calls[calls.length - 1][2].syncedCount).toBe(151);
  });
});

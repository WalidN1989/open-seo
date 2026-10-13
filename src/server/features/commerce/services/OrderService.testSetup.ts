import { beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAccess: vi.fn(),
  getProduct: vi.fn(),
  findMovementByReference: vi.fn(),
  applyMovements: vi.fn(),
  listOrders: vi.fn(),
  getOrder: vi.fn(),
  listLines: vi.fn(),
  findByExternalId: vi.fn(),
  createOrderWithLines: vi.fn(),
  setOrderState: vi.fn(),
  transitionNative: vi.fn(),
  enqueueApproved: vi.fn(),
  configuration: vi.fn(),
  getConnection: vi.fn(),
  getOrderRequest: vi.fn(),
  linkOrderRequest: vi.fn(),
  getContact: vi.fn(),
}));

vi.mock(
  "@/server/features/business-modules/repositories/BusinessModuleRepository",
  () => ({
    BusinessModuleRepository: {
      listEntitlements: vi
        .fn()
        .mockResolvedValue([{ moduleKey: "crm", status: "enabled" }]),
    },
  }),
);

vi.mock(
  "@/server/features/business-modules/services/BusinessModuleService",
  () => ({
    BusinessModuleService: { requireAccess: mocks.requireAccess },
  }),
);
vi.mock(
  "@/server/features/business-modules/services/BusinessSettingsService",
  () => ({
    BusinessSettingsService: { getSettings: async () => ({ currency: "LKR" }) },
  }),
);
vi.mock("@/server/features/crm/repositories/CrmRepository", () => ({
  CrmRepository: {
    getContact: mocks.getContact,
  },
}));
vi.mock("../repositories/CommerceRepository", () => ({
  CommerceRepository: { getProduct: mocks.getProduct },
}));
vi.mock("../repositories/InventoryRepository", () => ({
  InventoryRepository: {
    findMovementByReference: mocks.findMovementByReference,
    applyMovements: mocks.applyMovements,
  },
}));
vi.mock("../repositories/OrderRepository", () => ({
  OrderRepository: {
    listOrders: mocks.listOrders,
    getOrder: mocks.getOrder,
    listLines: mocks.listLines,
    findByExternalId: mocks.findByExternalId,
    createOrderWithLines: mocks.createOrderWithLines,
    setOrderState: mocks.setOrderState,
    transitionNative: mocks.transitionNative,
    getOrderRequest: mocks.getOrderRequest,
    linkOrderRequest: mocks.linkOrderRequest,
  },
}));

vi.mock("../repositories/BranchRepository", () => ({
  BranchRepository: {
    resolve: async (organizationId: string, branchId?: string) => ({
      id: branchId ?? `default:${organizationId}`,
    }),
  },
}));

vi.mock("./OrderOperationsService", () => ({
  OrderOperationsService: { enqueueApproved: mocks.enqueueApproved },
}));
vi.mock("../repositories/OrderOperationsRepository", () => ({
  OrderOperationsRepository: { configuration: mocks.configuration },
}));
vi.mock("../repositories/IntegrationSyncRepository", () => ({
  IntegrationSyncRepository: { getConnection: mocks.getConnection },
}));
vi.mock(
  "@/server/features/business-modules/repositories/BusinessModuleRepository",
  () => ({
    BusinessModuleRepository: {
      listEntitlements: vi
        .fn()
        .mockResolvedValue([{ moduleKey: "crm", status: "enabled" }]),
    },
  }),
);
vi.mock("../repositories/OrderLoyaltyRepository", () => ({
  OrderLoyaltyRepository: {},
}));
export const { OrderService, calculateTotals } = await import("./OrderService");

export const ORG = "org_1";
export const USER = "user_1";

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.requireAccess.mockResolvedValue(undefined);
  mocks.getProduct.mockResolvedValue({
    id: "p1",
    sku: "SKU-1",
    itemType: "product",
    inventoryMode: "single",
  });
  mocks.getContact.mockResolvedValue({
    firstName: "Customer",
    lastName: null,
    phone: null,
    whatsappPhone: null,
    email: null,
  });
  mocks.findMovementByReference.mockResolvedValue(null);
  mocks.applyMovements.mockResolvedValue(undefined);
  mocks.createOrderWithLines.mockResolvedValue(undefined);
  // createOrder re-reads the row it wrote; tests that care override this.
  mocks.getOrder.mockResolvedValue({ id: "new_order", status: "draft" });
  mocks.configuration.mockResolvedValue({ enabled: true });
  mocks.getConnection.mockResolvedValue({
    providerKey: "shopify",
    status: "connected",
  });
  mocks.transitionNative.mockImplementation(
    (_org: string, id: string, input: { values: Record<string, unknown> }) => ({
      id,
      ...input.values,
    }),
  );
  mocks.setOrderState.mockImplementation(
    (_org: string, id: string, values: Record<string, unknown>) => ({
      id,
      ...values,
    }),
  );
});

export { mocks };

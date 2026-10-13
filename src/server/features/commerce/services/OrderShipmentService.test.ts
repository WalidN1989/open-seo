import type * as CitypakProvider from "../providers/citypak";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  trackingShipment: vi.fn(),
  shipmentEvent: vi.fn(),
  trackingConnections: vi.fn(),
  dueTracking: vi.fn(),
  touch: vi.fn(),
  listEntitlements: vi.fn(),
  decryptCredentials: vi.fn(),
  trackCitypakOrder: vi.fn(),
}));
vi.mock("../repositories/CitypakRepository", () => ({
  CitypakRepository: mocks,
}));
vi.mock("../repositories/OrderOperationsRepository", () => ({
  OrderOperationsRepository: mocks,
}));
vi.mock(
  "@/server/features/business-modules/repositories/BusinessModuleRepository",
  () => ({ BusinessModuleRepository: mocks }),
);
vi.mock("@/server/lib/connection-secrets", () => ({
  decryptCredentials: mocks.decryptCredentials,
  mergeCredentials: vi.fn(),
}));
vi.mock(
  "@/server/features/business-modules/services/BusinessModuleService",
  () => ({ BusinessModuleService: { requireAccess: vi.fn() } }),
);
vi.mock("../repositories/OrderShipmentRepository", () => ({
  OrderShipmentRepository: {},
}));
vi.mock("../repositories/OrderRepository", () => ({ OrderRepository: {} }));
vi.mock("../repositories/IntegrationSyncRepository", () => ({
  IntegrationSyncRepository: {},
}));
vi.mock("../providers/citypak", async (importOriginal) => ({
  ...(await importOriginal<typeof CitypakProvider>()),
  trackCitypakOrder: mocks.trackCitypakOrder,
}));
import { OrderShipmentService } from "./OrderShipmentService";
const secret = "test-citypak-secret";
const event = {
  tracking_number: "D42",
  status: "OUT FOR DELIVERY",
  action_datetime: "14-10-2026 10:00:00",
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.connection.mockResolvedValue({
    config: { organizationId: "org-a", courierCredentials: "encrypted" },
  });
  mocks.listEntitlements.mockResolvedValue(
    ["crm", "integrations"].map((moduleKey) => ({
      moduleKey,
      status: "enabled",
    })),
  );
  mocks.decryptCredentials.mockResolvedValue({
    WEBHOOK_SECRET: secret,
    API_KEY: "test-key",
  });
  mocks.trackingShipment.mockResolvedValue({
    id: "shipment-a",
    status: "PENDING",
  });
});
describe("Citypak isolated tracking boundaries", () => {
  it("requires the callback secret before looking up shipments", async () => {
    expect(
      await OrderShipmentService.callback("connection-a", null, event),
    ).toBe(401);
    expect(
      await OrderShipmentService.callback("connection-a", "wrong", event),
    ).toBe(401);
    expect(mocks.trackingShipment).not.toHaveBeenCalled();
  });
  it("binds callback updates to the configured tenant and connection", async () => {
    expect(
      await OrderShipmentService.callback("connection-a", secret, event),
    ).toBe(200);
    expect(mocks.trackingShipment).toHaveBeenCalledWith(
      "org-a",
      "connection-a",
      "D42",
    );
    expect(mocks.shipmentEvent).toHaveBeenCalledWith(
      "org-a",
      "shipment-a",
      expect.objectContaining({
        status: "OUT FOR DELIVERY",
        eventAt: "2026-10-14T04:30:00.000Z",
        source: "webhook",
      }),
    );
  });
  it("rejects disabled modules and ignores unmatched or terminal shipments", async () => {
    mocks.listEntitlements.mockResolvedValue([]);
    expect(
      await OrderShipmentService.callback("connection-a", secret, event),
    ).toBe(404);
    mocks.listEntitlements.mockResolvedValue(
      ["crm", "integrations"].map((moduleKey) => ({
        moduleKey,
        status: "enabled",
      })),
    );
    mocks.trackingShipment
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "shipment-a", status: "DELIVERED" });
    await OrderShipmentService.callback("connection-a", secret, event);
    await OrderShipmentService.callback("connection-a", secret, event);
    expect(mocks.shipmentEvent).not.toHaveBeenCalled();
  });
  it("does not poll without an explicit opt-in", async () => {
    mocks.trackingConnections.mockResolvedValue([
      {
        organizationId: "org-a",
        connectionId: "connection-a",
        courierCredentials: "encrypted",
      },
    ]);
    await OrderShipmentService.runDueTracking();
    expect(mocks.dueTracking).not.toHaveBeenCalled();
    expect(mocks.trackCitypakOrder).not.toHaveBeenCalled();
  });
  it("bounds polling and retains recorded status on provider failure", async () => {
    mocks.trackingConnections.mockResolvedValue([
      {
        organizationId: "org-a",
        connectionId: "connection-a",
        courierCredentials: "encrypted",
      },
    ]);
    mocks.decryptCredentials.mockResolvedValue({
      TRACKING_ENABLED: "true",
      API_KEY: "test-key",
    });
    mocks.dueTracking.mockResolvedValue(
      Array.from({ length: 25 }, (_, i) => ({
        shipment: {
          id: `shipment-${i}`,
          trackingNumber: `D${i}`,
          status: "PENDING",
          checkedAt: null,
        },
      })),
    );
    mocks.trackCitypakOrder.mockRejectedValue(new Error("unavailable"));
    await OrderShipmentService.runDueTracking();
    expect(mocks.trackCitypakOrder).toHaveBeenCalledTimes(20);
    expect(mocks.shipmentEvent).not.toHaveBeenCalled();
    expect(mocks.touch).toHaveBeenCalledTimes(20);
  });
});

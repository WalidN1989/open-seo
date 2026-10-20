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
  citypakLabel: vi.fn(),
  getOrder: vi.fn(),
  shipments: vi.fn(),
  configuration: vi.fn(),
  recordStatus: vi.fn(),
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
  OrderShipmentRepository: {
    configuration: mocks.configuration,
    recordStatus: mocks.recordStatus,
  },
}));
vi.mock("../repositories/OrderRepository", () => ({
  OrderRepository: { getOrder: mocks.getOrder, shipments: mocks.shipments },
}));
vi.mock("../repositories/IntegrationSyncRepository", () => ({
  IntegrationSyncRepository: {},
}));
vi.mock("../providers/citypak", async (importOriginal) => ({
  ...(await importOriginal<typeof CitypakProvider>()),
  trackCitypakOrder: mocks.trackCitypakOrder,
  citypakLabel: mocks.citypakLabel,
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
  it("uses tracking for older Shopify rows instead of their unrelated fulfillment ID", async () => {
    const orderId = "shopify:connection-a:1";
    mocks.getOrder.mockResolvedValue({
      id: orderId,
      integrationConnectionId: "connection-a",
    });
    mocks.configuration.mockResolvedValue({ courierCredentials: "encrypted" });
    for (const [id, externalId, expected] of [
      [`${orderId}:fulfillment:999:D42`, "999", null],
      ["courier-shipment", "42", "42"],
      ["manual-shipment", null, null],
    ] as const) {
      mocks.shipments.mockResolvedValue([
        { id, provider: "Citypak", trackingNumber: "D42", externalId },
      ]);
      await OrderShipmentService.label("org-a", "user-a", orderId, id, "A4");
      expect(mocks.citypakLabel).toHaveBeenLastCalledWith(
        "test-key",
        "D42",
        "A4",
        fetch,
        expected,
      );
    }
  });
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

it("manual refresh bypasses the polling cooldown and records real scan times only", async () => {
  mocks.getOrder.mockResolvedValue({
    id: "order-a",
    integrationConnectionId: "connection-a",
  });
  mocks.shipments.mockResolvedValue([
    {
      id: "shipment-a",
      orderId: "order-a",
      provider: "Citypak",
      trackingNumber: "D42",
      status: "PENDING",
      checkedAt: new Date().toISOString(),
    },
  ]);
  mocks.configuration.mockResolvedValue({ courierCredentials: "encrypted" });
  mocks.trackCitypakOrder.mockResolvedValue({ delivered: true, events: [] });
  await OrderShipmentService.refresh(
    "org-a",
    "user-a",
    "order-a",
    "shipment-a",
  );
  expect(mocks.trackCitypakOrder).toHaveBeenCalledWith("test-key", "D42");
  expect(mocks.recordStatus).toHaveBeenCalledWith(
    "org-a",
    "order-a",
    "shipment-a",
    "DELIVERED",
  );
  expect(mocks.shipmentEvent).not.toHaveBeenCalled();
});
it("polling only considers the requested courier connection", async () => {
  mocks.trackingConnections.mockResolvedValue([
    {
      organizationId: "org-b",
      connectionId: "connection-b",
      courierCredentials: "encrypted",
    },
  ]);
  await OrderShipmentService.runDueTracking("connection-a");
  expect(mocks.decryptCredentials).not.toHaveBeenCalled();
  expect(mocks.dueTracking).not.toHaveBeenCalled();
});
it("keeps an empty Citypak history unknown rather than claiming delivery", async () => {
  mocks.getOrder.mockResolvedValue({
    id: "order-a",
    integrationConnectionId: "connection-a",
  });
  mocks.shipments.mockResolvedValue([
    {
      id: "shipment-a",
      orderId: "order-a",
      provider: "Citypak",
      trackingNumber: "D42",
      status: "UNKNOWN",
    },
  ]);
  mocks.configuration.mockResolvedValue({ courierCredentials: "encrypted" });
  mocks.trackCitypakOrder.mockResolvedValue({ delivered: false, events: [] });
  await OrderShipmentService.refresh(
    "org-a",
    "user-a",
    "order-a",
    "shipment-a",
  );
  expect(mocks.recordStatus).not.toHaveBeenCalled();
  expect(mocks.shipmentEvent).not.toHaveBeenCalled();
  expect(mocks.touch).toHaveBeenCalledWith("org-a", "shipment-a");
});

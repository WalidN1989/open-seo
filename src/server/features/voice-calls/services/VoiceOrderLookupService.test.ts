import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  order: vi.fn(),
  details: vi.fn(),
  shipments: vi.fn(),
  connection: vi.fn(),
  config: vi.fn(),
  modules: vi.fn(),
  decrypt: vi.fn(),
}));
vi.mock("@/server/features/commerce/repositories/OrderRepository", () => ({
  OrderRepository: { customerOrder: mocks.order, shipments: mocks.shipments },
}));
vi.mock("@/server/features/commerce/services/OrderService", () => ({
  OrderService: { lookupCustomerOrder: mocks.details },
}));
vi.mock(
  "@/server/features/commerce/repositories/OrderShipmentRepository",
  () => ({ OrderShipmentRepository: { configuration: mocks.config } }),
);
vi.mock(
  "@/server/features/commerce/repositories/IntegrationSyncRepository",
  () => ({ IntegrationSyncRepository: { getConnection: mocks.connection } }),
);
vi.mock(
  "@/server/features/business-modules/repositories/BusinessModuleRepository",
  () => ({ BusinessModuleRepository: { listEntitlements: mocks.modules } }),
);
vi.mock("@/server/lib/connection-secrets", () => ({
  decryptCredentials: mocks.decrypt,
}));
import { VoiceOrderLookupService as service } from "./VoiceOrderLookupService";
const fetcher = vi.fn<typeof fetch>();
const saved = {
  provider: "Citypak",
  trackingNumber: "D123",
  status: "PENDING",
  checkedAt: "2026-10-20T10:00:00.000Z",
  lastEventAt: null,
};
const lookup = () => service.delivery("org-a", "+94770000001", "SHOP-1");
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetcher);
  mocks.order.mockResolvedValue({
    id: "order",
    orderNumber: "SHOP-1",
    operationsConnectionId: "shop",
    pickup: false,
  });
  mocks.details.mockResolvedValue(
    JSON.stringify({ found: true, orderId: "SHOP-1", shipments: [saved] }),
  );
  mocks.shipments.mockResolvedValue([saved]);
  mocks.connection.mockResolvedValue({ status: "connected" });
  mocks.config.mockResolvedValue({ courierCredentials: "encrypted" });
  mocks.modules.mockResolvedValue([
    { moduleKey: "crm", status: "enabled" },
    { moduleKey: "integrations", status: "enabled" },
  ]);
  mocks.decrypt.mockResolvedValue({ API_KEY: "test-private-key" });
  fetcher.mockResolvedValue(
    Response.json({
      success: true,
      data: {
        is_delivered: false,
        tracking_history: [
          { status: "OUT FOR DELIVERY", date: "2026-10-24", time: "11:00:00" },
        ],
      },
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());
describe("live Citypak voice lookup", () => {
  it("authorizes the order by workspace and trusted caller before any courier request", async () => {
    mocks.order.mockResolvedValue(null);
    expect(await lookup()).toMatchObject({ found: false });
    expect(mocks.order).toHaveBeenCalledWith("org-a", "SHOP-1", "+94770000001");
    expect(fetcher).not.toHaveBeenCalled();
    expect(mocks.config).not.toHaveBeenCalled();
  });
  it("reads fresh courier facts using only the saved WB, with a bounded read-only request", async () => {
    const result = await lookup();
    expect(result).toMatchObject({
      found: true,
      waybillGenerated: true,
      citypak: [
        { trackingNumber: "D123", status: "OUT FOR DELIVERY", live: true },
      ],
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toBe(
      "https://falcon.citypak.lk/customer_api/v1/track?tracking_number=D123",
    );
    expect(init).toMatchObject({
      redirect: "manual",
      headers: { Authorization: "Bearer test-private-key" },
    });
    expect(init?.method).toBeUndefined();
    expect(init?.body).toBeUndefined();
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.stringify(result)).not.toContain("test-private-key");
    expect(mocks.config).toHaveBeenCalledWith("org-a", "shop");
  });
  it("never lets a query select another phone or a tracking URL", async () => {
    for (const query of [
      "+94770000002",
      "https://evil.example/track",
      "D999",
      "SHOP-1 / D999",
    ])
      expect(
        await service.delivery("org-a", "+94770000001", query),
      ).toMatchObject({ found: false });
    expect(fetcher).not.toHaveBeenCalled();
    expect(mocks.order).not.toHaveBeenCalled();
  });
  it("honors a disabled CRM before reading courier credentials", async () => {
    mocks.details.mockResolvedValue('{"found":false}');
    expect(await lookup()).toEqual({ found: false });
    expect(mocks.decrypt).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["crm", "integrations"])(
    "does not use credentials when %s is disabled",
    async (key) => {
      mocks.modules.mockResolvedValue([
        {
          moduleKey: key === "crm" ? "integrations" : "crm",
          status: "enabled",
        },
      ]);
      expect(await lookup()).toMatchObject({
        citypak: [{ live: false, status: "PENDING" }],
      });
      expect(mocks.config).not.toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it("does not use a disconnected fulfillment connection", async () => {
    mocks.connection.mockResolvedValue({ status: "disconnected" });
    mocks.decrypt.mockResolvedValue({});
    expect(await lookup()).toMatchObject({ citypak: [{ live: false }] });
    expect(mocks.config).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    new Error("timeout"),
    new DOMException("timed out", "TimeoutError"),
  ])(
    "labels saved status honestly when the courier cannot be reached",
    async (error) => {
      fetcher.mockRejectedValue(error);
      expect(await lookup()).toMatchObject({
        citypak: [
          { status: "PENDING", checkedAt: saved.checkedAt, live: false },
        ],
      });
    },
  );
  it("falls back safely for malformed or rejected responses", async () => {
    fetcher.mockResolvedValue(
      Response.json({ success: false, data: {} }, { status: 401 }),
    );
    expect(await lookup()).toMatchObject({ citypak: [{ live: false }] });
  });
  it("does not claim a stale delivery state when the live API has no events", async () => {
    fetcher.mockResolvedValue(
      Response.json({ success: true, data: { tracking_history: [] } }),
    );
    expect(await lookup()).toMatchObject({
      citypak: [{ status: "UNKNOWN", live: true, lastEventAt: null }],
    });
  });
  it("uses the delivered flag and provider event times rather than inventing arrival estimates", async () => {
    fetcher.mockResolvedValue(
      Response.json({
        success: true,
        data: { is_delivered: true, tracking_history: [] },
      }),
    );
    expect(await lookup()).toMatchObject({
      citypak: [{ status: "DELIVERED", live: true }],
    });
  });
  it("recognizes pickup without a waybill and makes no courier request", async () => {
    mocks.order.mockResolvedValue({
      id: "order",
      orderNumber: "SHOP-1",
      pickup: true,
    });
    mocks.shipments.mockResolvedValue([]);
    expect(await lookup()).toMatchObject({
      waybillGenerated: false,
      citypak: [],
      note: expect.stringContaining("pickup"),
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not interpret a missing WB as proof that the order has not shipped", async () => {
    mocks.shipments.mockResolvedValue([]);
    expect(await lookup()).toMatchObject({
      waybillGenerated: false,
      note: expect.stringContaining("does not prove"),
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("retains saved details on missing or unreadable credentials", async () => {
    mocks.decrypt.mockRejectedValue(new Error("decryption failed"));
    expect(await lookup()).toMatchObject({ citypak: [{ live: false }] });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("bounds courier work to two recorded shipments", async () => {
    mocks.shipments.mockResolvedValue([
      saved,
      { ...saved, trackingNumber: "D456" },
      { ...saved, trackingNumber: "D789" },
      { ...saved, provider: "Other courier" },
    ]);
    await lookup();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  products: vi.fn(),
  southsideProducts: vi.fn(),
  entitlements: vi.fn(),
  orders: vi.fn(),
}));
vi.mock("@/server/lib/connection-secrets", () => ({
  decryptCredentials: async () => ({ CALLER_LOOKUP_SECRET: "test-secret" }),
}));
vi.mock("../repositories/PhoneCallRepository", () => ({
  PhoneCallRepository: { getIntegrationById: mocks.connection },
}));
vi.mock(
  "@/server/features/business-modules/repositories/BusinessModuleRepository",
  () => ({
    BusinessModuleRepository: { listEntitlements: mocks.entitlements },
  }),
);
vi.mock(
  "@/server/features/communications/repositories/WhatsappAssistantRepository",
  () => ({
    WhatsappAssistantRepository: {
      searchPricedProducts: mocks.products,
      currencyFor: async () => "LKR",
    },
  }),
);
vi.mock("@/server/features/commerce/services/OrderService", () => ({
  OrderService: { lookupCustomerOrder: mocks.orders },
}));
vi.mock("@/server/features/commerce/repositories/CommerceRepository", () => ({
  CommerceRepository: { listProducts: mocks.southsideProducts },
}));
const SOUTHSIDE_ORGANIZATION_ID = "test-southside-workspace";
import { VoiceCustomerQueryService as service } from "./VoiceCustomerQueryService";

const headers = () =>
  new Headers({
    "x-openseo-secret": "test-secret",
    "x-caller-id": "+94771111111",
  });
beforeEach(() => {
  vi.stubEnv("SOUTHSIDE_WORKFLOW_ORGANIZATION_ID", "test-southside-workspace");
  mocks.connection.mockResolvedValue({
    providerKey: "elevenlabs",
    status: "connected",
    credentials: "cipher",
    organizationId: "org-a",
  });
  mocks.entitlements.mockResolvedValue([
    { moduleKey: "crm", status: "enabled" },
  ]);
  mocks.products.mockResolvedValue([
    {
      name: "ABC book",
      sku: "ABC",
      salePriceMinor: 100000,
      quantityOnHand: 0,
      productUrl: "https://book.example/abc",
    },
  ]);
  mocks.orders.mockResolvedValue(
    '{"found":true,"orders":[{"orderId":"SHOP-1"}]}',
  );
});
describe("ElevenLabs live CRM query", () => {
  it("rejects unauthenticated calls before reading products or orders", async () => {
    expect(
      (
        await service.query(
          "connection",
          new Headers(),
          '{"action":"search_products","query":"ABC"}',
        )
      ).status,
    ).toBe(401);
    expect(mocks.products).not.toHaveBeenCalled();
    expect(mocks.orders).not.toHaveBeenCalled();
  });
  it("returns live zero stock and prices from the connection's workspace", async () => {
    const result = await service.query(
      "connection",
      headers(),
      '{"action":"search_products","query":"ABC"}',
    );
    expect(mocks.products).toHaveBeenCalledWith("org-a", "ABC");
    expect(result.body).toMatchObject({
      source: "DigitalUrgency CRM",
      currency: "LKR",
      products: [{ price: 1000, stock: 0, availability: "out_of_stock" }],
    });
  });
  it("keeps unknown stock distinct from zero", async () => {
    mocks.products.mockResolvedValue([
      {
        name: "Unknown",
        sku: "U",
        salePriceMinor: 1,
        quantityOnHand: null,
        productUrl: null,
      },
    ]);
    expect(
      (
        await service.query(
          "connection",
          headers(),
          '{"action":"search_products","query":"unknown"}',
        )
      ).body,
    ).toMatchObject({ products: [{ stock: null, availability: "unknown" }] });
  });
  it("uses the runtime caller header and searches orders without an order ID", async () => {
    await service.query("connection", headers(), '{"action":"search_orders"}');
    expect(mocks.orders).toHaveBeenCalledWith("org-a", "+94771111111", "");
  });
  it("does not accept a model-selected phone or organization", async () => {
    expect(
      (
        await service.query(
          "connection",
          headers(),
          '{"action":"search_orders","phone":"+94772222222"}',
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await service.query(
          "connection",
          headers(),
          '{"action":"search_orders","organizationId":"org-b"}',
        )
      ).status,
    ).toBe(400);
    expect(mocks.orders).not.toHaveBeenCalled();
  });
  it("does not substitute a spoken number when caller ID is missing", async () => {
    const h = headers();
    h.delete("x-caller-id");
    expect(
      (
        await service.query(
          "connection",
          h,
          '{"action":"search_orders","query":"+94772222222"}',
        )
      ).body,
    ).toMatchObject({ found: false });
    expect(mocks.orders).not.toHaveBeenCalled();
  });
  it("refuses disabled CRM, disconnected integrations and arbitrary actions", async () => {
    mocks.entitlements.mockResolvedValue([]);
    expect(
      (
        await service.query(
          "connection",
          headers(),
          '{"action":"search_products","query":"ABC"}',
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await service.query(
          "connection",
          headers(),
          '{"action":"create_customer"}',
        )
      ).status,
    ).toBe(400);
    mocks.connection.mockResolvedValue({
      providerKey: "elevenlabs",
      status: "disconnected",
    });
    expect(
      (
        await service.query(
          "connection",
          headers(),
          '{"action":"search_products","query":"ABC"}',
        )
      ).status,
    ).toBe(404);
  });
});

describe("Southside product pricing", () => {
  it("returns real prices, supply terms and null for unpriced items without claiming warehouse stock", async () => {
    mocks.connection.mockResolvedValue({
      providerKey: "elevenlabs",
      status: "connected",
      credentials: "test",
      organizationId: SOUTHSIDE_ORGANIZATION_ID,
    });
    mocks.entitlements.mockResolvedValue([
      { moduleKey: "crm", status: "enabled" },
    ]);
    mocks.southsideProducts.mockResolvedValue({
      products: [
        {
          name: "TEST steel post",
          sku: "TEST-POST",
          description: "Supply only",
          salePriceMinor: 1990,
          productUrl: "https://example.invalid/product",
        },
        {
          name: "TEST gate frame",
          sku: "TEST-GATE",
          description: "Starting price",
          salePriceMinor: 24900,
        },
        { name: "TEST enquiry only", sku: "TEST-UNPRICED", salePriceMinor: 0 },
      ],
    });
    const result = await service.query(
      "southside",
      headers(),
      JSON.stringify({ action: "search_products", query: "TEST" }),
    );
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      products: [
        { price: 19.9 },
        {
          price: 249,
          pricingBasis: "starting price, supply only, GST included",
        },
        { price: null },
      ],
      fallback: "Our representative will get in touch with you.",
    });
    expect(mocks.southsideProducts).toHaveBeenCalledWith(
      SOUTHSIDE_ORGANIZATION_ID,
      expect.any(Object),
    );
  });
});

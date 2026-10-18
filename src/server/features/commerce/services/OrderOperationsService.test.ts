import { beforeEach, expect, it, vi } from "vitest";
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
vi.mock(
  "@/server/features/commerce/repositories/OrderLoyaltyRepository",
  () => ({ OrderLoyaltyRepository: { award: vi.fn() } }),
);
const state = vi.hoisted(() => ({
  eligible: true,
  invalidateDuringClaim: true,
  effectStatus: "queued",
  kind: "confirmation",
  send: vi.fn(),
  citypak: vi.fn(),
  invoice: vi.fn(),
  email: vi.fn(),
  finish: vi.fn(),
  completeMessage: vi.fn(),
}));
const fixtures = vi.hoisted(() => {
  const contacts: {
    senderContactName: string | null;
    senderAltPhone: string | null;
  } = { senderContactName: null, senderAltPhone: null };
  return {
    order: {
      id: "order",
      organizationId: "org",
      integrationConnectionId: "connection",
      status: "confirmed",
      approvalStatus: "approved",
      currency: "LKR",
      createdAt: "2026-10-14T00:00:00Z",
      updatedAt: "revision",
      customerName: "Synthetic",
      customerPhone: "+94770000000",
      customerEmail: "customer@example.test",
      orderNumber: "SHOP-1",
      shippingAddress: "Synthetic road",
      shippingCity: "Synthetic city",
      totalMinor: 1000,
      paidMinor: 0,
      pickup: false,
    },
    config: {
      enabled: true,
      confirmationStartedAt: "2026-01-01T00:00:00Z",
      operationsStartedAt: "2026-01-01T00:00:00Z",
      confirmationSenderId: "sender",
      confirmationTemplateId: "template",
      invoiceEnabled: true,
      parcelWeightGrams: 500,
      senderName: "Synthetic Books",
      ...contacts,
    },
    sender: { id: "sender", provider: "twilio", status: "connected" },
    template: {
      id: "template",
      connectionId: "sender",
      body: "Hi {{1}} {{2}}",
      status: "approved",
    },
  };
});
vi.mock(
  "@/server/features/commerce/repositories/OrderOperationsRepository",
  () => ({
    OrderOperationsRepository: {
      due: async () =>
        state.effectStatus === "queued"
          ? [
              {
                id: "effect",
                organizationId: "org",
                orderId: "order",
                kind: state.kind,
              },
            ]
          : [],
      configuration: async () => fixtures.config,
      sender: async () => fixtures.sender,
      template: async () => fixtures.template,
      claim: async () => {
        if (state.effectStatus !== "queued") return null;
        state.effectStatus = "sending";
        if (state.invalidateDuringClaim) state.eligible = false;
        return { id: "effect" };
      },
      canDispatch: async () => state.eligible,
      message: async () => "message",
      finish: state.finish,
      recordShipment: vi.fn(),
      defer: async () => undefined,
    },
  }),
);
vi.mock("@/server/features/commerce/repositories/OrderRepository", () => ({
  OrderRepository: {
    getOrder: async () => fixtures.order,
    shipments: async () => [],
    listLines: async () => [],
  },
}));
vi.mock(
  "@/server/features/commerce/repositories/IntegrationSyncRepository",
  () => ({
    IntegrationSyncRepository: {
      getConnection: async () => ({ status: "connected" }),
    },
  }),
);
vi.mock(
  "@/server/features/business-modules/repositories/BusinessModuleRepository",
  () => ({
    BusinessModuleRepository: {
      listEntitlements: async () =>
        ["crm", "integrations", "whatsapp", "invoicing", "email"].map(
          (moduleKey) => ({ moduleKey, status: "enabled" }),
        ),
    },
  }),
);
vi.mock("@/server/lib/connection-secrets", () => ({
  decryptCredentials: async () => ({ API_KEY: "synthetic" }),
}));
vi.mock("@/server/features/communications/providers/whatsapp", () => ({
  sendWhatsappTemplate: state.send,
}));
vi.mock("@/server/features/commerce/providers/citypak", () => ({
  createCitypakOrder: state.citypak,
}));
vi.mock("@/server/features/invoicing/repositories/InvoiceRepository", () => ({
  InvoiceRepository: {
    getSettings: async () => null,
    issueInvoice: state.invoice,
  },
}));
vi.mock("@/server/features/email/services/EmailSendService", () => ({
  EmailSendService: { sendFromConnectedMailbox: state.email },
}));
vi.mock(
  "@/server/features/communications/repositories/CommunicationsRepository",
  () => ({
    CommunicationsRepository: {
      completeWhatsappMessage: state.completeMessage,
    },
  }),
);
beforeEach(() => {
  vi.clearAllMocks();
  state.eligible = true;
  state.invalidateDuringClaim = true;
  state.effectStatus = "queued";
  state.kind = "confirmation";
  state.send.mockReset();
  state.finish.mockImplementation(
    (_org: string, _id: string, values: { status: string }) => {
      state.effectStatus = values.status;
    },
  );
});
it.each(["confirmation", "citypak", "invoice"])(
  "does not dispatch %s when eligibility changes during claiming",
  async (kind) => {
    state.kind = kind;
    const { OrderOperationsService } = await import("./OrderOperationsService");
    await OrderOperationsService.runDue();
    expect(state.send).not.toHaveBeenCalled();
    expect(state.citypak).not.toHaveBeenCalled();
    expect(state.invoice).not.toHaveBeenCalled();
    expect(state.email).not.toHaveBeenCalled();
    expect(state.finish).toHaveBeenCalledWith(
      "org",
      "effect",
      expect.objectContaining({ status: "skipped" }),
    );
    if (kind === "confirmation")
      expect(state.completeMessage).toHaveBeenCalledWith("org", "message", {
        status: "failed",
      });
  },
);

it("records uncertain provider outcomes in the inbox without an automatic resend", async () => {
  state.invalidateDuringClaim = false;
  state.send.mockRejectedValue(
    new Error("Connection interrupted after submitting the message"),
  );
  const { OrderOperationsService } = await import("./OrderOperationsService");
  await OrderOperationsService.runDue();
  expect(state.completeMessage).toHaveBeenCalledWith("org", "message", {
    status: "unknown",
  });
  expect(state.finish).toHaveBeenCalledWith(
    "org",
    "effect",
    expect.objectContaining({ status: "unknown" }),
  );
  await OrderOperationsService.runDue();
  expect(state.send).toHaveBeenCalledTimes(1);
  expect(state.effectStatus).toBe("unknown");
});

it.each([
  [null, null, "Synthetic Books", ""],
  ["Test Staff", "+94110000001", "Test Staff", "+94110000001"],
])(
  "uses saved sender contacts for Citypak (%s)",
  async (contact, phone, expectedContact, expectedPhone) => {
    state.invalidateDuringClaim = false;
    state.kind = "citypak";
    fixtures.config.senderContactName = contact;
    fixtures.config.senderAltPhone = phone;
    state.citypak.mockResolvedValue({
      trackingNumber: "D-SYNTHETIC",
      externalId: "synthetic",
    });
    const { OrderOperationsService } = await import("./OrderOperationsService");
    await OrderOperationsService.runDue();
    expect(state.citypak).toHaveBeenCalledWith(
      "synthetic",
      expect.objectContaining({
        from_contact_name: expectedContact,
        from_contact_2: expectedPhone,
      }),
    );
    expect(state.finish).toHaveBeenCalledWith(
      "org",
      "effect",
      expect.objectContaining({
        status: "succeeded",
        externalId: "D-SYNTHETIC",
      }),
    );
  },
);

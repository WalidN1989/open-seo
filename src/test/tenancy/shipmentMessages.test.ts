import type { sendWhatsappTemplate } from "@/server/features/communications/providers/whatsapp";
import { beforeAll, beforeEach, afterAll, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  createTenancyFixture,
  ORG_A,
  ORG_B,
  ORDER_A,
  WHATSAPP_A,
  USER_OWNER_A,
} from "./fixture";
import type * as Service from "@/server/features/commerce/services/ShipmentMessagesService";
import type * as Repository from "@/server/features/commerce/repositories/ShipmentMessagesRepository";
import type * as Operations from "@/server/features/commerce/repositories/OrderOperationsRepository";
import type * as Config from "@/server/features/commerce/services/ShipmentMessagesConfigService";
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
const approval = vi.hoisted(() => vi.fn());
vi.mock("@/server/features/communications/providers/twilioContent", () => ({
  fetchOrderConfirmationTemplate: approval,
}));
const send = vi.hoisted(() => vi.fn<typeof sendWhatsappTemplate>());
vi.mock("@/server/features/communications/providers/whatsapp", () => ({
  sendWhatsappTemplate: send,
}));
let fixture: Awaited<ReturnType<typeof createTenancyFixture>>;
let service: typeof Service.ShipmentMessagesService;
let repo: typeof Repository.ShipmentMessagesRepository;
let operations: typeof Operations.OrderOperationsRepository;
let configService: typeof Config.ShipmentMessagesConfigService;
const connection = "shipment-connection";
const cutoff = "2026-10-01T00:00:00.000Z";
const generated = "2026-10-21T12:00:00.000Z";
let currentOrder = "";
beforeAll(async () => {
  fixture = await createTenancyFixture();
  vi.doMock("@/db", () => ({ db: fixture.db }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: fixture.db }));
  vi.doMock("@/db/pg/client", () => ({ pgDb: null }));
  ({ ShipmentMessagesService: service } =
    await import("@/server/features/commerce/services/ShipmentMessagesService"));
  ({ ShipmentMessagesRepository: repo } =
    await import("@/server/features/commerce/repositories/ShipmentMessagesRepository"));
  ({ OrderOperationsRepository: operations } =
    await import("@/server/features/commerce/repositories/OrderOperationsRepository"));
  ({ ShipmentMessagesConfigService: configService } =
    await import("@/server/features/commerce/services/ShipmentMessagesConfigService"));
  const s = await import("@/db/schema");
  await fixture.db.insert(s.integrationConnections).values({
    id: connection,
    organizationId: ORG_A,
    providerKey: "shopify",
    displayName: "Synthetic",
    status: "connected",
  });
  await fixture.db
    .insert(s.commerceOrderSync)
    .values({ connectionId: connection, organizationId: ORG_A, enabled: true });
  await fixture.db
    .update(s.whatsappConnections)
    .set({ provider: "twilio", status: "connected" })
    .where(eq(s.whatsappConnections.id, WHATSAPP_A));
  await fixture.db.insert(s.whatsappTemplates).values(
    ["wb", "estimate"].map((id) => ({
      id,
      organizationId: ORG_A,
      connectionId: WHATSAPP_A,
      name: id,
      category: "UTILITY",
      body: "Hi {{1}}, order {{2}}, waybill {{3}}.",
      status: "approved",
      externalTemplateId: "HXsynthetic",
    })),
  );
});
beforeEach(async () => {
  approval.mockReset().mockResolvedValue({
    status: "approved",
    body: "Hi {{1}}, order {{2}}, waybill {{3}}.",
    languageCode: "en",
  });
  send
    .mockReset()
    .mockResolvedValue({ externalMessageId: "SMsynthetic", status: "sent" });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.parse(generated) + 1000);
  const s = await import("@/db/schema");
  if (currentOrder)
    await fixture.db
      .delete(s.commerceOrders)
      .where(eq(s.commerceOrders.id, currentOrder));
  await operations.configure(ORG_A, connection, {
    shipmentMessagesStartedAt: cutoff,
    shipmentSenderId: WHATSAPP_A,
    waybillTemplateId: "wb",
    deliveryEstimateTemplateId: "estimate",
    confirmationStartedAt: null,
    operationsStartedAt: null,
  });
  const [original] = await fixture.db
    .select()
    .from(s.commerceOrders)
    .where(eq(s.commerceOrders.id, ORDER_A));
  currentOrder = crypto.randomUUID();
  await fixture.db.insert(s.commerceOrders).values({
    ...original,
    id: currentOrder,
    orderNumber: currentOrder,
    operationsConnectionId: connection,
    status: "confirmed",
    approvalStatus: "approved",
    pickup: false,
    customerPhone: "+94770000000",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: generated,
  });
  await fixture.db.insert(s.commerceOrderShipments).values({
    id: crypto.randomUUID(),
    organizationId: ORG_A,
    orderId: currentOrder,
    provider: "Citypak",
    trackingNumber: "D-SYNTHETIC",
    createdAt: generated,
    status: "PENDING",
  });
  await fixture.db.insert(s.commerceOrderEffects).values({
    id: crypto.randomUUID(),
    organizationId: ORG_A,
    orderId: currentOrder,
    kind: "citypak",
    status: "succeeded",
    externalId: "D-SYNTHETIC",
  });
});
afterAll(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  fixture.client.close();
});
it("sends once on generation, survives repeated/concurrent passes, then sends once at 24 hours", async () => {
  await Promise.all([service.runDue(connection), service.runDue(connection)]);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0]?.[2].variables).toMatchObject({
    "2": currentOrder,
    "3": "D-SYNTHETIC",
  });
  await service.runDue(connection);
  expect(send).toHaveBeenCalledTimes(1);
  vi.setSystemTime(Date.parse(generated) + 24 * 60 * 60 * 1000 - 1);
  await service.runDue(connection);
  expect(send).toHaveBeenCalledTimes(1);
  vi.setSystemTime(Date.parse(generated) + 24 * 60 * 60 * 1000 + 1000);
  await Promise.all([service.runDue(connection), service.runDue(connection)]);
  expect(send).toHaveBeenCalledTimes(2);
  expect(
    (await operations.effects(ORG_A, currentOrder)).filter((e) =>
      ["waybill", "delivery_estimate"].includes(e.kind),
    ),
  ).toHaveLength(2);
});
it("does not replay existing/imported waybills or read another connection/tenant", async () => {
  await operations.configure(ORG_A, connection, {
    shipmentMessagesStartedAt: "2026-10-22T00:00:00.000Z",
  });
  expect(await repo.candidates(connection)).toHaveLength(0);
  expect(await repo.candidates("foreign-connection")).toHaveLength(0);
  expect(await operations.configuration(ORG_B, connection)).toBeNull();
  await service.runDue(connection);
  expect(send).not.toHaveBeenCalled();
});
it("does not send when opted out or cancelled before the durable claim", async () => {
  const s = await import("@/db/schema");
  await fixture.db
    .insert(s.whatsappConversations)
    .values({
      id: "optedout",
      organizationId: ORG_A,
      connectionId: WHATSAPP_A,
      externalConversationId: "+94770000000",
      optedOutAt: generated,
    })
    .onConflictDoNothing();
  await fixture.db
    .update(s.whatsappConversations)
    .set({ optedOutAt: generated })
    .where(
      and(
        eq(s.whatsappConversations.connectionId, WHATSAPP_A),
        eq(s.whatsappConversations.externalConversationId, "+94770000000"),
      ),
    );
  await service.runDue(connection);
  expect(send).not.toHaveBeenCalled();
  await fixture.db
    .update(s.whatsappConversations)
    .set({ optedOutAt: null })
    .where(
      and(
        eq(s.whatsappConversations.connectionId, WHATSAPP_A),
        eq(s.whatsappConversations.externalConversationId, "+94770000000"),
      ),
    );
  await fixture.db
    .update(s.commerceOrders)
    .set({ status: "cancelled" })
    .where(eq(s.commerceOrders.id, currentOrder));
  vi.setSystemTime(Date.parse(generated) + 60 * 60 * 1000);
  await service.runDue(connection);
  expect(send).not.toHaveBeenCalled();
});
it("suppresses the next-day estimate after delivery or return", async () => {
  await service.runDue(connection);
  expect(send).toHaveBeenCalledTimes(1);
  const s = await import("@/db/schema");
  await fixture.db
    .update(s.commerceOrderShipments)
    .set({ status: "DELIVERED" })
    .where(eq(s.commerceOrderShipments.orderId, currentOrder));
  vi.setSystemTime(Date.parse(generated) + 25 * 60 * 60 * 1000);
  await service.runDue(connection);
  expect(send).toHaveBeenCalledTimes(1);
  await fixture.db
    .update(s.commerceOrderShipments)
    .set({ status: "RTM" })
    .where(eq(s.commerceOrderShipments.orderId, currentOrder));
  await service.runDue(connection);
  expect(send).toHaveBeenCalledTimes(1);
});
it("holds an ambiguous send without retry or follow-up", async () => {
  send.mockRejectedValue(new Error("Network timeout after acceptance"));
  await service.runDue(connection);
  expect(
    (await operations.effects(ORG_A, currentOrder)).find(
      (e) => e.kind === "waybill",
    )?.status,
  ).toBe("unknown");
  vi.setSystemTime(Date.parse(generated) + 25 * 60 * 60 * 1000);
  await service.runDue(connection);
  await service.runDue(connection);
  expect(send).toHaveBeenCalledTimes(1);
});
it("requires the right sender, templates and permissions and does not modify existing automation", async () => {
  await expect(
    configService.configure(ORG_B, USER_OWNER_A, {
      connectionId: connection,
      enabled: true,
      senderId: WHATSAPP_A,
      waybillTemplateId: "wb",
      deliveryEstimateTemplateId: "estimate",
    }),
  ).rejects.toThrow();
  await expect(
    configService.configure(ORG_A, USER_OWNER_A, {
      connectionId: connection,
      enabled: true,
      senderId: WHATSAPP_A,
      waybillTemplateId: "wb",
      deliveryEstimateTemplateId: "missing",
    }),
  ).rejects.toThrow();
  await configService.configure(ORG_A, USER_OWNER_A, {
    connectionId: connection,
    enabled: false,
    senderId: WHATSAPP_A,
    waybillTemplateId: "wb",
    deliveryEstimateTemplateId: "estimate",
  });
  expect(await operations.configuration(ORG_A, connection)).toMatchObject({
    shipmentMessagesStartedAt: null,
    confirmationStartedAt: null,
    operationsStartedAt: null,
  });
  await service.runDue(connection);
  expect(send).not.toHaveBeenCalled();
});

it("normalizes new generation timestamps and excludes manually linked legacy waybills", async () => {
  const s = await import("@/db/schema");
  await fixture.db
    .delete(s.commerceOrderShipments)
    .where(eq(s.commerceOrderShipments.orderId, currentOrder));
  await operations.recordShipment(ORG_A, currentOrder, "D-SYNTHETIC", null);
  const [shipment] = await fixture.db
    .select()
    .from(s.commerceOrderShipments)
    .where(eq(s.commerceOrderShipments.orderId, currentOrder));
  expect(shipment.createdAt).toBe(new Date().toISOString());
  expect(await repo.candidates(connection)).toHaveLength(1);
  await fixture.db
    .update(s.commerceOrderEffects)
    .set({ status: "legacy" })
    .where(
      and(
        eq(s.commerceOrderEffects.orderId, currentOrder),
        eq(s.commerceOrderEffects.kind, "citypak"),
      ),
    );
  expect(await repo.candidates(connection)).toHaveLength(0);
});

it("supports generation-only activation without queuing a next-day message", async () => {
  await configService.configure(ORG_A, USER_OWNER_A, {
    connectionId: connection,
    enabled: true,
    senderId: WHATSAPP_A,
    waybillTemplateId: "wb",
    deliveryEstimateTemplateId: null,
  });
  await Promise.all([service.runDue(connection), service.runDue(connection)]);
  expect(send).toHaveBeenCalledTimes(1);
  expect(await repo.candidates(connection)).toHaveLength(0);
  vi.setSystemTime(Date.parse(generated) + 3 * 24 * 60 * 60 * 1000);
  await service.runDue(connection);
  expect(send).toHaveBeenCalledTimes(1);
  expect(
    (await operations.effects(ORG_A, currentOrder)).filter(
      (e) => e.kind === "delivery_estimate",
    ),
  ).toHaveLength(0);
});

it("holds messages when current Twilio approval is paused or cannot be verified", async () => {
  approval.mockResolvedValue({
    status: "pending",
    body: "Hi {{1}}, order {{2}}, waybill {{3}}.",
    languageCode: "en",
  });
  await service.runDue(connection);
  expect(send).not.toHaveBeenCalled();
  await expect(
    configService.configure(ORG_A, USER_OWNER_A, {
      connectionId: connection,
      enabled: true,
      senderId: WHATSAPP_A,
      waybillTemplateId: "wb",
      deliveryEstimateTemplateId: null,
    }),
  ).rejects.toThrow();
  approval.mockRejectedValue(new Error("Provider unavailable"));
  await service.runDue(connection);
  expect(send).not.toHaveBeenCalled();
});

it("rechecks current provider approval immediately before sending", async () => {
  approval
    .mockResolvedValueOnce({
      status: "approved",
      body: "Hi {{1}}, order {{2}}, waybill {{3}}.",
      languageCode: "en",
    })
    .mockResolvedValue({
      status: "pending",
      body: "Hi {{1}}, order {{2}}, waybill {{3}}.",
      languageCode: "en",
    });
  await service.runDue(connection);
  expect(send).not.toHaveBeenCalled();
});

it("does not schedule a follow-up after an explicit failed provider result", async () => {
  send.mockResolvedValue({
    externalMessageId: "SMfailed",
    status: "undelivered",
  });
  await service.runDue(connection);
  expect(
    (await operations.effects(ORG_A, currentOrder)).find(
      (e) => e.kind === "waybill",
    )?.status,
  ).toBe("unknown");
  vi.setSystemTime(Date.parse(generated) + 2 * 24 * 60 * 60 * 1000);
  await service.runDue(connection);
  expect(send).toHaveBeenCalledTimes(1);
});

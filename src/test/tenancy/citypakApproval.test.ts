import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  createTenancyFixture,
  ORG_A,
  ORG_B,
  ORDER_A,
  USER_OWNER_A,
  USER_OWNER_B,
  PRODUCT_A,
} from "./fixture";
import type * as Schema from "@/db/schema";
import type * as CitypakProvider from "@/server/features/commerce/providers/citypak";
import type * as SecretsModule from "@/server/lib/connection-secrets";
import type * as RetailModule from "@/server/features/commerce/services/RetailOrderService";
import type * as OperationsModule from "@/server/features/commerce/services/OrderOperationsService";
import type * as RepositoryModule from "@/server/features/commerce/repositories/OrderOperationsRepository";
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
const provider = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/server/features/commerce/providers/citypak", async (original) => ({
  ...(await original<typeof CitypakProvider>()),
  createCitypakOrder: provider.create,
}));
vi.mock("@/server/lib/connection-secrets", async (original) => ({
  ...(await original<typeof SecretsModule>()),
  decryptCredentials: async (value: string | null) =>
    value === "synthetic-citypak" ? { API_KEY: "synthetic" } : {},
}));
let fixture: Awaited<ReturnType<typeof createTenancyFixture>>;
let schema: typeof Schema;
let retail: typeof RetailModule.RetailOrderService;
let operations: typeof OperationsModule.OrderOperationsService;
let repo: typeof RepositoryModule.OrderOperationsRepository;
const connectionId = "citypak-approval-fixture";
const cutoff = "2026-10-17T00:00:00.000Z";
beforeAll(async () => {
  fixture = await createTenancyFixture();
  vi.doMock("@/db", () => ({ db: fixture.db }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: fixture.db }));
  vi.doMock("@/db/pg/client", () => ({ pgDb: null }));
  schema = await import("@/db/schema");
  await fixture.db.insert(schema.integrationConnections).values({
    id: connectionId,
    organizationId: ORG_A,
    providerKey: "shopify",
    displayName: "Synthetic shop",
    status: "connected",
  });
  await fixture.db
    .insert(schema.commerceOrderSync)
    .values({ connectionId, organizationId: ORG_A, enabled: true });
  ({ RetailOrderService: retail } =
    await import("@/server/features/commerce/services/RetailOrderService"));
  ({ OrderOperationsService: operations } =
    await import("@/server/features/commerce/services/OrderOperationsService"));
  ({ OrderOperationsRepository: repo } =
    await import("@/server/features/commerce/repositories/OrderOperationsRepository"));
});
beforeEach(async () => {
  provider.create.mockReset().mockResolvedValue({
    trackingNumber: "D-SYNTHETIC",
    externalId: "synthetic-provider-id",
  });
  await repo.configure(ORG_A, connectionId, {
    enabled: true,
    operationsStartedAt: cutoff,
    confirmationStartedAt: null,
    courierCredentials: "synthetic-citypak",
    senderName: "Synthetic sender",
    senderPhone: "+94770000001",
    senderAddress1: "Synthetic road",
    senderCity: "Synthetic city",
    parcelWeightGrams: 500,
    invoiceEnabled: false,
    loyaltyMinorPerPoint: 0,
  });
});
afterAll(() => fixture.client.close());
async function pending(
  id: string,
  options: {
    paidMinor?: number;
    missingDelivery?: boolean;
    pickup?: boolean;
  } = {},
) {
  const [original] = await fixture.db
    .select()
    .from(schema.commerceOrders)
    .where(eq(schema.commerceOrders.id, ORDER_A));
  const revision = "2026-10-16T00:00:00.000Z";
  await fixture.db.insert(schema.commerceOrders).values({
    ...original,
    id,
    orderNumber: id,
    integrationConnectionId: connectionId,
    operationsConnectionId: null,
    status: "draft",
    approvalStatus: "pending",
    externalUpdatedAt: revision,
    updatedAt: revision,
    confirmedAt: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    currency: "LKR",
    totalMinor: 10000,
    paidMinor: options.paidMinor ?? 2500,
    pickup: options.pickup ?? false,
    customerPhone: options.missingDelivery ? null : "+94770000002",
    shippingAddress: options.missingDelivery ? null : "Synthetic delivery road",
    shippingCity: options.missingDelivery ? null : "Synthetic city",
    note: null,
  });
  await fixture.db.insert(schema.commerceOrderLines).values({
    id: `${id}-line`,
    organizationId: ORG_A,
    orderId: id,
    productId: PRODUCT_A,
    description: "Synthetic book",
    quantity: 1,
    unitPriceMinor: 10000,
    lineTotalMinor: 10000,
  });
  return {
    orderId: id,
    revision,
    acknowledgeAdjustments: false,
    lines: [
      { lineId: `${id}-line`, productId: PRODUCT_A, acknowledgePrice: true },
    ],
  };
}
it("approves an existing pending order and dispatches only its Citypak action immediately", async () => {
  const input = await pending("old-pending-approved");
  const other = await pending("another-order-queued");
  await repo.enqueue(ORG_A, other.orderId, "confirmation");
  await fixture.db.insert(schema.commerceOrderShipments).values({
    id: "existing-other-carrier",
    organizationId: ORG_A,
    orderId: input.orderId,
    provider: "Other",
    trackingNumber: "OLD-SYNTHETIC",
    status: "PENDING",
  });
  const result = await retail.approveImportedOrder(ORG_A, USER_OWNER_A, input);
  expect(result.citypak).toMatchObject({
    status: "succeeded",
    trackingNumber: "D-SYNTHETIC",
  });
  expect(result.confirmedAt).toBeTruthy();
  expect(provider.create).toHaveBeenCalledOnce();
  expect(provider.create).toHaveBeenCalledWith(
    "synthetic",
    expect.objectContaining({
      reference: input.orderId,
      cash_on_delivery_amount: 75,
    }),
  );
  expect(await repo.effects(ORG_A, input.orderId)).toMatchObject([
    { kind: "citypak", status: "succeeded" },
  ]);
  expect(await repo.effects(ORG_A, other.orderId)).toMatchObject([
    { kind: "confirmation", status: "queued" },
  ]);
  expect(await repo.shipments(ORG_B)).toEqual([]);
});
it("uses zero COD for fully paid orders", async () => {
  const input = await pending("paid-citypak", { paidMinor: 10000 });
  await retail.approveImportedOrder(ORG_A, USER_OWNER_A, input);
  expect(provider.create).toHaveBeenCalledWith(
    "synthetic",
    expect.objectContaining({ cash_on_delivery_amount: 0 }),
  );
});
it("keeps incomplete delivery orders pending and saves staff corrections atomically on approval", async () => {
  const input = await pending("missing-delivery", { missingDelivery: true });
  await expect(
    retail.approveImportedOrder(ORG_A, USER_OWNER_A, input),
  ).rejects.toThrow("Complete the delivery");
  const [unchanged] = await fixture.db
    .select()
    .from(schema.commerceOrders)
    .where(eq(schema.commerceOrders.id, input.orderId));
  expect(unchanged.approvalStatus).toBe("pending");
  expect(await repo.effects(ORG_A, input.orderId)).toEqual([]);
  expect(provider.create).not.toHaveBeenCalled();
  const result = await retail.approveImportedOrder(ORG_A, USER_OWNER_A, {
    ...input,
    delivery: {
      phone: "+94 77 000 0002",
      address: "Verified synthetic address",
      city: "Verified synthetic city",
    },
  });
  expect(result).toMatchObject({
    customerPhone: "+94770000002",
    shippingAddress: "Verified synthetic address",
    shippingCity: "Verified synthetic city",
    citypak: { status: "succeeded" },
  });
});
it("preserves approval and records ambiguous provider failures without resending", async () => {
  const input = await pending("uncertain-citypak");
  provider.create.mockRejectedValue(new Error("Connection interrupted"));
  const result = await retail.approveImportedOrder(ORG_A, USER_OWNER_A, input);
  expect(result.approvalStatus).toBe("approved");
  expect(result.citypak?.status).toBe("unknown");
  await operations.dispatchCitypak(ORG_A, input.orderId);
  expect(provider.create).toHaveBeenCalledOnce();
});
it("does not create a waybill for pickup", async () => {
  const input = await pending("pickup-citypak", {
    pickup: true,
    missingDelivery: true,
  });
  const result = await retail.approveImportedOrder(ORG_A, USER_OWNER_A, input);
  expect(result.citypak).toBeNull();
  expect(provider.create).not.toHaveBeenCalled();
});
it("leaves creation disabled until explicitly configured", async () => {
  const input = await pending("disabled-citypak");
  await repo.configure(ORG_A, connectionId, { operationsStartedAt: null });
  const result = await retail.approveImportedOrder(ORG_A, USER_OWNER_A, input);
  expect(result.citypak).toBeNull();
  expect(provider.create).not.toHaveBeenCalled();
});
it("does not dispatch historical approvals or another tenant's order", async () => {
  const input = await pending("historical-approved");
  await fixture.db
    .update(schema.commerceOrders)
    .set({
      approvalStatus: "approved",
      status: "confirmed",
      confirmedAt: "2026-10-02T00:00:00.000Z",
    })
    .where(eq(schema.commerceOrders.id, input.orderId));
  await operations.enqueueApproved(ORG_A, input.orderId);
  expect(await repo.effects(ORG_A, input.orderId)).toEqual([]);
  expect(await operations.dispatchCitypak(ORG_B, input.orderId)).toBeNull();
  await expect(
    retail.approveImportedOrder(ORG_B, USER_OWNER_B, input),
  ).rejects.toThrow("NOT_FOUND");
  expect(provider.create).not.toHaveBeenCalled();
});
it("blocks approval when enabled Citypak has lost its credential", async () => {
  const input = await pending("missing-citypak-key");
  await repo.configure(ORG_A, connectionId, { courierCredentials: null });
  await expect(
    retail.approveImportedOrder(ORG_A, USER_OWNER_A, input),
  ).rejects.toThrow("Connect Citypak");
  expect(await repo.effects(ORG_A, input.orderId)).toEqual([]);
  expect(provider.create).not.toHaveBeenCalled();
});

it("approving an old pending order does not backfill invoice or loyalty actions", async () => {
  const input = await pending("old-citypak-only");
  await repo.configure(ORG_A, connectionId, {
    invoiceEnabled: true,
    loyaltyMinorPerPoint: 100,
  });
  const result = await retail.approveImportedOrder(ORG_A, USER_OWNER_A, input);
  expect(result.citypak?.status).toBe("succeeded");
  expect(await repo.effects(ORG_A, input.orderId)).toMatchObject([
    { kind: "citypak", status: "succeeded" },
  ]);
  const entries = await fixture.db
    .select()
    .from(schema.commerceLoyaltyEntries)
    .where(eq(schema.commerceLoyaltyEntries.orderId, input.orderId));
  expect(entries).toEqual([]);
});

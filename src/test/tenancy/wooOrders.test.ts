import { z } from "zod";
import type * as WooProvider from "@/server/features/commerce/providers/woocommerce";
import type * as WhatsappProvider from "@/server/features/communications/providers/whatsapp";
import { beforeAll, afterAll, beforeEach, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  createTenancyFixture,
  ORG_A,
  ORG_B,
  USER_OWNER_A,
  USER_OWNER_B,
  USER_STAFF_A,
  INTEGRATION_A,
  WHATSAPP_A,
  WHATSAPP_B,
  PRODUCT_A,
} from "./fixture";
import type * as Schema from "@/db/schema";
import type * as Service from "@/server/features/commerce/services/WooOrderService";
import type * as Operations from "@/server/features/commerce/repositories/OrderOperationsRepository";
const state = vi.hoisted(() => ({
  fetch: vi.fn(),
  send: vi.fn<typeof WhatsappProvider.sendWhatsappTemplate>(),
  template: vi.fn(),
}));
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
vi.mock(
  "@/server/features/commerce/providers/woocommerce",
  async (original) => ({
    ...(await original<typeof WooProvider>()),
    fetchWooOrderPage: state.fetch,
  }),
);
vi.mock("@/server/features/communications/providers/twilioContent", () => ({
  fetchOrderConfirmationTemplate: state.template,
}));
vi.mock(
  "@/server/features/communications/providers/whatsapp",
  async (original) => ({
    ...(await original<typeof WhatsappProvider>()),
    sendWhatsappTemplate: state.send,
  }),
);
let fixture: Awaited<ReturnType<typeof createTenancyFixture>>;
let schema: typeof Schema;
let Woo: typeof Service.WooOrderService;
let Ops: typeof Operations.OrderOperationsRepository;
const sid = `HX${"a".repeat(32)}`;
const body = "Hi {{1}}, we received order {{2}}. Total {{3}}.";
const verified = { body, languageCode: "en", status: "pending" };
function raw(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    number: String(id),
    date_created_gmt: "2026-10-21T12:01:00",
    date_modified_gmt: "2026-10-21T12:01:00",
    status: "processing",
    currency: "LKR",
    total: "5070.00",
    discount_total: "0.00",
    shipping_total: "0.00",
    total_tax: "0.00",
    billing: {
      first_name: "Alex",
      phone: "+94770000000",
      country: "LK",
      email: "alex@example.test",
    },
    shipping: {},
    payment_method: "cod",
    date_paid_gmt: null,
    line_items: [
      {
        id: id * 100,
        product_id: 346,
        variation_id: 0,
        name: "Period panty",
        sku: "ALPHA-1",
        quantity: 3,
        subtotal: "5070.00",
        total: "5070.00",
      },
    ],
    ...overrides,
  };
}
async function effects(id: number) {
  return Ops.effects(ORG_A, `woocommerce:${INTEGRATION_A}:${id}`);
}
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-21T12:00:00Z"));
  fixture = await createTenancyFixture();
  const db = fixture.db;
  vi.doMock("@/db", () => ({ db }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: db }));
  vi.doMock("@/db/pg/client", () => ({ pgDb: null }));
  schema = await import("@/db/schema");
  await db
    .update(schema.whatsappConnections)
    .set({ provider: "twilio" })
    .where(eq(schema.whatsappConnections.id, WHATSAPP_A));
  ({ WooOrderService: Woo } =
    await import("@/server/features/commerce/services/WooOrderService"));
  ({ OrderOperationsRepository: Ops } =
    await import("@/server/features/commerce/repositories/OrderOperationsRepository"));
  await db
    .update(schema.commerceProducts)
    .set({ externalSource: "woocommerce", externalId: "346" })
    .where(eq(schema.commerceProducts.id, PRODUCT_A));
  await Woo.enable(ORG_A, USER_OWNER_A, INTEGRATION_A, true);
});
beforeEach(() => {
  state.fetch.mockReset().mockResolvedValue({ payload: [], hasMore: false });
  state.template.mockReset().mockResolvedValue(verified);
  state.send.mockReset().mockImplementation((_sender, _phone, template) =>
    Promise.resolve({
      externalMessageId: `SM-test-${template.variables?.["2"]}`,
      status: "queued",
    }),
  );
});
afterAll(() => {
  fixture.client.close();
  vi.useRealTimers();
});
it("refuses foreign connections/senders and view-only staff before provider calls", async () => {
  await expect(
    Woo.enable(ORG_B, USER_OWNER_B, INTEGRATION_A, true),
  ).rejects.toThrow();
  await expect(
    Woo.importHistory(ORG_A, USER_STAFF_A, INTEGRATION_A, 1),
  ).rejects.toThrow();
  await expect(
    Woo.configureConfirmation(ORG_A, USER_OWNER_A, {
      connectionId: INTEGRATION_A,
      enabled: true,
      senderId: WHATSAPP_B,
      contentSid: sid,
    }),
  ).rejects.toThrow();
  expect(state.fetch).not.toHaveBeenCalled();
  expect(state.template).not.toHaveBeenCalled();
});
it("saves the submitted template as pending and sets the server activation cutoff", async () => {
  await Woo.configureConfirmation(ORG_A, USER_OWNER_A, {
    connectionId: INTEGRATION_A,
    enabled: true,
    senderId: WHATSAPP_A,
    contentSid: sid,
  });
  const config = await Ops.configuration(ORG_A, INTEGRATION_A);
  expect(config).toMatchObject({
    confirmationStartedAt: "2026-10-21T12:00:00.000Z",
    operationsStartedAt: null,
    invoiceEnabled: false,
  });
  const [template] = await fixture.db
    .select()
    .from(schema.whatsappTemplates)
    .where(eq(schema.whatsappTemplates.id, config.confirmationTemplateId!));
  expect(template.status).toBe("pending");
  expect(template.connectionId).toBe(WHATSAPP_A);
});
it("mirrors history with real line quantities and customer details without queuing messages", async () => {
  state.fetch.mockResolvedValue({ payload: [raw(100)], hasMore: false });
  await Woo.importHistory(ORG_A, USER_OWNER_A, INTEGRATION_A, 1);
  await Woo.importHistory(ORG_A, USER_OWNER_A, INTEGRATION_A, 1);
  expect(await effects(100)).toHaveLength(0);
  expect(state.send).not.toHaveBeenCalled();
  const [order] = await fixture.db
    .select()
    .from(schema.commerceOrders)
    .where(eq(schema.commerceOrders.id, `woocommerce:${INTEGRATION_A}:100`));
  expect(order).toMatchObject({
    customerName: "Alex",
    customerPhone: "+94770000000",
    totalMinor: 507000,
    approvalStatus: "pending",
  });
  const lines = await fixture.db
    .select()
    .from(schema.commerceOrderLines)
    .where(eq(schema.commerceOrderLines.orderId, order.id));
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatchObject({
    quantity: 3,
    unitPriceMinor: 169000,
    productId: PRODUCT_A,
  });
});
it("queues one confirmation for new orders while approval is pending; excludes old/draft/cancelled orders", async () => {
  state.fetch.mockResolvedValue({
    payload: [
      raw(101),
      raw(102, { date_created_gmt: "2026-01-01T12:00:00" }),
      raw(103, { status: "cancelled" }),
      raw(104, {
        status: "checkout-draft",
        line_items: [],
        date_created_gmt: null,
        date_modified_gmt: null,
      }),
    ],
    hasMore: false,
  });
  await Woo.sync(INTEGRATION_A);
  await Woo.sync(INTEGRATION_A);
  expect(await effects(101)).toMatchObject([
    { kind: "confirmation", status: "queued" },
  ]);
  expect(await effects(102)).toHaveLength(0);
  expect(await effects(103)).toHaveLength(0);
  expect(await effects(104)).toHaveLength(0);
  expect(state.send).not.toHaveBeenCalled();
});
it("automatically sends queued confirmations when Twilio approves, with order number and total, once only", async () => {
  state.template.mockResolvedValue({ ...verified, status: "approved" });
  state.fetch.mockResolvedValue({ payload: [raw(101)], hasMore: false });
  await Woo.sync(INTEGRATION_A);
  await Woo.sync(INTEGRATION_A);
  expect(state.send).toHaveBeenCalledTimes(1);
  expect(state.send.mock.calls[0][1]).toBe("+94770000000");
  expect(state.send.mock.calls[0][2].variables).toMatchObject({
    "1": "Alex",
    "2": "101",
  });
  expect(state.send.mock.calls[0][2].variables?.["3"]).toContain("5,070.00");
  expect(await effects(101)).toMatchObject([
    { status: "succeeded", externalId: "SM-test-101" },
  ]);
});
it("respects STOP, cancellation and missing recipient gates", async () => {
  state.template.mockResolvedValue({ ...verified, status: "approved" });
  state.fetch.mockResolvedValue({
    payload: [
      raw(105, { billing: { first_name: "Alex", phone: "invalid" } }),
      raw(106),
      raw(107, { billing: { phone: "+94771111111" } }),
    ],
    hasMore: false,
  });
  await fixture.db.insert(schema.whatsappConversations).values({
    id: "opted-out-woo",
    organizationId: ORG_A,
    connectionId: WHATSAPP_A,
    externalConversationId: "+94771111111",
    optedOutAt: "2026-10-21T12:00:00Z",
  });
  // Pending approval holds 106 long enough for a cancellation snapshot to arrive.
  state.template.mockResolvedValue(verified);
  await Woo.sync(INTEGRATION_A);
  state.fetch.mockResolvedValue({
    payload: [
      raw(106, {
        status: "cancelled",
        date_modified_gmt: "2026-10-21T12:02:00",
      }),
    ],
    hasMore: false,
  });
  state.template.mockResolvedValue({ ...verified, status: "approved" });
  await Woo.sync(INTEGRATION_A);
  expect(state.send).not.toHaveBeenCalled();
  expect(await effects(105)).toMatchObject([{ status: "skipped" }]);
});
it("never retries an ambiguous provider outcome on later syncs", async () => {
  state.fetch.mockResolvedValue({ payload: [raw(108)], hasMore: false });
  state.template.mockResolvedValue({ ...verified, status: "approved" });
  state.send.mockRejectedValue(new Error("timeout after acceptance"));
  await Woo.sync(INTEGRATION_A);
  await Woo.sync(INTEGRATION_A);
  expect(state.send).toHaveBeenCalledTimes(1);
  expect(await effects(108)).toMatchObject([{ status: "unknown" }]);
});
it("does not dispatch on Twilio rejection, changed wording, API failure, or disabled sync", async () => {
  state.fetch.mockResolvedValue({ payload: [raw(109)], hasMore: false });
  state.template.mockResolvedValue({ ...verified, status: "rejected" });
  await Woo.sync(INTEGRATION_A);
  expect(await effects(109)).toMatchObject([{ status: "queued" }]);
  expect(state.send).not.toHaveBeenCalled();
  state.template.mockResolvedValue({
    ...verified,
    body: "Changed wording",
    status: "approved",
  });
  await expect(Woo.sync(INTEGRATION_A)).rejects.toThrow("wording changed");
  state.template.mockRejectedValue(new Error("provider offline"));
  await expect(Woo.sync(INTEGRATION_A)).rejects.toThrow();
  expect(state.send).not.toHaveBeenCalled();
  await Woo.enable(ORG_A, USER_OWNER_A, INTEGRATION_A, false);
  expect(await Woo.sync(INTEGRATION_A)).toBe(false);
  expect(state.send).not.toHaveBeenCalled();
});
it("applies only newer snapshots and does not mutate stock while mirroring", async () => {
  await Woo.enable(ORG_A, USER_OWNER_A, INTEGRATION_A, true);
  const before = await fixture.db.select().from(schema.commerceStockMovements);
  state.fetch.mockResolvedValue({
    payload: [
      raw(110, { date_modified_gmt: "2026-10-21T12:03:00", total: "5100.00" }),
    ],
    hasMore: false,
  });
  await Woo.importHistory(ORG_A, USER_OWNER_A, INTEGRATION_A, 1);
  state.fetch.mockResolvedValue({ payload: [raw(110)], hasMore: false });
  await Woo.importHistory(ORG_A, USER_OWNER_A, INTEGRATION_A, 1);
  const [row] = await fixture.db
    .select()
    .from(schema.commerceOrders)
    .where(
      and(
        eq(schema.commerceOrders.organizationId, ORG_A),
        eq(schema.commerceOrders.id, `woocommerce:${INTEGRATION_A}:110`),
      ),
    );
  expect(row.totalMinor).toBe(510000);
  expect(await fixture.db.select().from(schema.commerceStockMovements)).toEqual(
    before,
  );
});

it("keeps its cursor after a failed page and resumes without advancing the modification watermark", async () => {
  const rows = Array.from({ length: 25 }, (_, i) =>
    raw(200 + i, { date_created_gmt: "2026-01-01T12:00:00" }),
  );
  state.fetch.mockResolvedValue({ payload: rows, hasMore: true });
  const before = await Ops.configuration(ORG_A, INTEGRATION_A);
  await Woo.sync(INTEGRATION_A);
  const cursor = (await Ops.configuration(ORG_A, INTEGRATION_A))?.cursor;
  expect(JSON.parse(cursor!)).toMatchObject({
    page: 2,
    after: z.object({ after: z.string() }).parse(JSON.parse(before.cursor!))
      .after,
  });
  state.fetch.mockRejectedValue(new Error("temporary Woo failure"));
  await expect(Woo.sync(INTEGRATION_A)).rejects.toThrow();
  expect((await Ops.configuration(ORG_A, INTEGRATION_A))?.cursor).toBe(cursor);
  state.fetch.mockResolvedValue({ payload: [], hasMore: false });
  await Woo.sync(INTEGRATION_A);
  expect(state.fetch.mock.calls.at(-1)?.[1]).toBe(2);
  expect(
    JSON.parse((await Ops.configuration(ORG_A, INTEGRATION_A)).cursor!),
  ).toMatchObject({ page: 1 });
});
it("claims a confirmation once across overlapping passes", async () => {
  state.fetch.mockResolvedValue({ payload: [raw(111)], hasMore: false });
  state.template.mockResolvedValue({ ...verified, status: "approved" });
  await Promise.all([Woo.sync(INTEGRATION_A), Woo.sync(INTEGRATION_A)]);
  expect(
    state.send.mock.calls.filter((call) => call[2].variables?.["2"] === "111"),
  ).toHaveLength(1);
  expect(await effects(111)).toMatchObject([{ status: "succeeded" }]);
});

it("holds an unsubmitted claim when approval becomes unavailable immediately before sending", async () => {
  for (const id of [106, 107]) {
    const [effect] = await effects(id);
    if (effect?.status === "queued")
      await Ops.finish(ORG_A, effect.id, { status: "skipped" });
  }
  state.fetch.mockResolvedValue({ payload: [raw(112)], hasMore: false });
  state.template
    .mockResolvedValueOnce({ ...verified, status: "approved" })
    .mockResolvedValueOnce({ ...verified, status: "approved" })
    .mockRejectedValueOnce(new Error("temporary approval API failure"));
  await Woo.sync(INTEGRATION_A);
  expect(
    state.send.mock.calls.filter((call) => call[2].variables?.["2"] === "112"),
  ).toHaveLength(0);
  expect(await effects(112)).toMatchObject([
    { status: "queued", claimedAt: null, completedAt: null },
  ]);
  vi.setSystemTime(new Date("2026-10-21T12:06:00Z"));
  state.template.mockResolvedValue({ ...verified, status: "approved" });
  await Woo.sync(INTEGRATION_A);
  expect(
    state.send.mock.calls.filter((call) => call[2].variables?.["2"] === "112"),
  ).toHaveLength(1);
});

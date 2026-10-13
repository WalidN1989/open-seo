import type * as LoyaltyModule from "@/server/features/commerce/repositories/OrderLoyaltyRepository";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import {
  createTenancyFixture,
  ORG_A,
  ORG_B,
  ORDER_A,
  CONTACT_A,
} from "./fixture";
import type * as Module from "@/server/features/commerce/repositories/OrderOperationsRepository";
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
let fixture: Awaited<ReturnType<typeof createTenancyFixture>>;
let repo: typeof Module.OrderOperationsRepository;
let loyalty: typeof LoyaltyModule.OrderLoyaltyRepository;
beforeAll(async () => {
  fixture = await createTenancyFixture();
  vi.doMock("@/db", () => ({ db: fixture.db }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: fixture.db }));
  vi.doMock("@/db/pg/client", () => ({ pgDb: null }));
  ({ OrderOperationsRepository: repo } =
    await import("@/server/features/commerce/repositories/OrderOperationsRepository"));
  ({ OrderLoyaltyRepository: loyalty } =
    await import("@/server/features/commerce/repositories/OrderLoyaltyRepository"));
});
afterAll(() => fixture.client.close());
describe("durable order actions", () => {
  it("claims a repeated or concurrent confirmation only once", async () => {
    await Promise.all([
      repo.enqueue(ORG_A, ORDER_A, "confirmation"),
      repo.enqueue(ORG_A, ORDER_A, "confirmation"),
    ]);
    const claimed = await Promise.all([
      repo.claim(ORG_A, ORDER_A, "confirmation"),
      repo.claim(ORG_A, ORDER_A, "confirmation"),
    ]);
    expect(claimed.filter(Boolean)).toHaveLength(1);
    expect(await repo.effects(ORG_A, ORDER_A)).toHaveLength(1);
  });
  it("retains uncertain results without allowing an automatic resend", async () => {
    const [effect] = await repo.effects(ORG_A, ORDER_A);
    await repo.finish(ORG_A, effect.id, { status: "unknown" });
    expect(await repo.claim(ORG_A, ORDER_A, "confirmation")).toBeNull();
    expect((await repo.due()).some((row) => row.id === effect.id)).toBe(false);
  });
  it("cannot claim or finish another organization's action", async () => {
    const [effect] = await repo.effects(ORG_A, ORDER_A);
    expect(await repo.claim(ORG_B, ORDER_A, "confirmation")).toBeNull();
    await repo.finish(ORG_B, effect.id, { status: "succeeded" });
    expect((await repo.effects(ORG_A, ORDER_A))[0].status).toBe("unknown");
    expect(await repo.effects(ORG_B, ORDER_A)).toEqual([]);
  });
  it("does not duplicate a tracking identity when linking twice", async () => {
    await repo.recordShipment(ORG_A, ORDER_A, "DTEST1", "1");
    await repo.recordShipment(ORG_A, ORDER_A, "DTEST1", "1");
    expect(
      (await repo.shipments(ORG_A)).filter(
        (candidate) => candidate.shipment.trackingNumber === "DTEST1",
      ),
    ).toHaveLength(1);
    expect(
      (await repo.shipments(ORG_B)).some(
        (entry) => entry.shipment.trackingNumber === "DTEST1",
      ),
    ).toBe(false);
  });
  it("does not regress a later courier event on replay", async () => {
    const row = (await repo.shipments(ORG_A)).find(
      (candidate) => candidate.shipment.trackingNumber === "DTEST1",
    )!;
    await repo.shipmentEvent(ORG_A, row.shipment.id, {
      status: "DELIVERED",
      eventAt: "2026-10-13T12:00:00Z",
      reason: null,
      source: "webhook",
    });
    await repo.shipmentEvent(ORG_A, row.shipment.id, {
      status: "PENDING",
      eventAt: "2026-10-12T12:00:00Z",
      reason: null,
      source: "pull",
    });
    expect(
      (await repo.shipments(ORG_A)).find(
        (r) => r.shipment.id === row.shipment.id,
      )?.shipment.status,
    ).toBe("DELIVERED");
  });
  it("awards loyalty once using the existing contact", async () => {
    const schema = await import("@/db/schema");
    const order = await fixture.db
      .select()
      .from(schema.commerceOrders)
      .then((rows) => rows.find((row) => row.id === ORDER_A)!);
    await loyalty.award(
      ORG_A,
      { ...order, contactId: CONTACT_A, totalMinor: 10000 },
      1000,
    );
    await loyalty.award(
      ORG_A,
      { ...order, contactId: CONTACT_A, totalMinor: 10000 },
      1000,
    );
    expect(await loyalty.loyalty(ORG_A, CONTACT_A)).toBe(10);
    expect(await loyalty.loyalty(ORG_B, CONTACT_A)).toBe(0);
  });
  it("defers a blocked queued action so it does not occupy the next batch", async () => {
    await repo.enqueue(ORG_A, ORDER_A, "cancellation");
    const action = (await repo.effects(ORG_A, ORDER_A)).find(
      (entry) => entry.kind === "cancellation",
    )!;
    expect((await repo.due()).some((entry) => entry.id === action.id)).toBe(
      true,
    );
    await repo.defer(ORG_A, action.id);
    expect((await repo.due()).some((entry) => entry.id === action.id)).toBe(
      false,
    );
    expect(
      (await repo.effects(ORG_A, ORDER_A)).find(
        (entry) => entry.id === action.id,
      )?.status,
    ).toBe("queued");
  });
  it("reconciles invoice lines with shipping, discount, tax and payment", async () => {
    const { InvoiceRepository } =
      await import("@/server/features/invoicing/repositories/InvoiceRepository");
    const schema = await import("@/db/schema");
    const original = (
      await fixture.db.select().from(schema.commerceOrders)
    ).find((entry) => entry.id === ORDER_A)!;
    const order = {
      ...original,
      subtotalMinor: 10000,
      deliveryMinor: 1000,
      discountMinor: 500,
      taxMinor: 500,
      totalMinor: 11000,
      paidMinor: 4000,
      paymentStatus: "partial" as const,
    };
    const lines = [
      {
        id: "test-retail-line",
        organizationId: ORG_A,
        invoiceId: `retail:${ORDER_A}`,
        position: 0,
        description: "Book",
        quantityMilli: 1000,
        unitPriceMinor: 10000,
        amountMinor: 10000,
      },
    ];
    const invoiceId = await InvoiceRepository.issueInvoice(order, lines, "{}");
    const invoice = await InvoiceRepository.getInvoice(ORG_A, invoiceId);
    const savedLines = await InvoiceRepository.listLines(ORG_A, invoiceId);
    expect(savedLines.reduce((sum, line) => sum + line.amountMinor, 0)).toBe(
      10500,
    );
    expect(invoice).toMatchObject({
      subtotalMinor: 10500,
      taxMinor: 500,
      totalMinor: 11000,
      paidMinor: 4000,
    });
    expect(await InvoiceRepository.getInvoice(ORG_B, invoiceId)).toBeNull();
  });
});

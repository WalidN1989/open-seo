import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { createTenancyFixture, ORG_A, ORG_B, ORDER_A } from "./fixture";
import type * as Module from "@/server/features/commerce/repositories/CitypakRepository";
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
let fixture: Awaited<ReturnType<typeof createTenancyFixture>>;
let repo: typeof Module.CitypakRepository;
beforeAll(async () => {
  fixture = await createTenancyFixture();
  vi.doMock("@/db", () => ({ db: fixture.db }));
  const schema = await import("@/db/schema");
  for (let i = 0; i < 55; i++)
    await fixture.db.insert(schema.commerceOrderShipments).values({
      id: `citypak-${i}`,
      organizationId: ORG_A,
      orderId: ORDER_A,
      provider: "Citypak",
      trackingNumber: `DTEST${String(i).padStart(3, "0")}`,
      status: i === 54 ? "DELIVERED" : "PENDING",
      createdAt: `2026-10-14T00:${String(i).padStart(2, "0")}:00.000Z`,
    });
  await fixture.db.insert(schema.commerceOrderShipments).values({
    id: "other-courier",
    organizationId: ORG_A,
    orderId: ORDER_A,
    provider: "Other",
    trackingNumber: "DOTHER",
    status: "DELIVERED",
  });
  ({ CitypakRepository: repo } =
    await import("@/server/features/commerce/repositories/CitypakRepository"));
});
afterAll(() => fixture.client.close());
describe("Citypak dashboard pagination and scoping", () => {
  const filters = {
    search: "",
    status: "",
    payment: "" as const,
    paymentMethod: "",
    limit: 50,
    offset: 0,
  };
  it("counts all matching waybills and retrieves the remaining page", async () => {
    const first = await repo.dashboard(ORG_A, filters);
    const second = await repo.dashboard(ORG_A, { ...filters, offset: 50 });
    expect(first.total).toBe(55);
    expect(first.rows).toHaveLength(50);
    expect(second.rows).toHaveLength(5);
    expect(
      new Set([...first.rows, ...second.rows].map((row) => row.shipment.id))
        .size,
    ).toBe(55);
    expect(first.inTransit).toBe(54);
  });
  it("filters before pagination and updates the summary counts", async () => {
    const found = await repo.dashboard(ORG_A, {
      ...filters,
      search: "DTEST054",
    });
    expect(found.total).toBe(1);
    expect(found.inTransit).toBe(0);
    expect(found.rows[0].shipment.trackingNumber).toBe("DTEST054");
    expect(
      (await repo.dashboard(ORG_A, { ...filters, status: "DELIVERED" })).total,
    ).toBe(1);
  });
  it("filters the actual stored gateway independently of payment state", async () => {
    const schema = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    expect(
      (await repo.dashboard(ORG_A, { ...filters, paymentMethod: "__unset__" }))
        .total,
    ).toBe(55);
    await fixture.db
      .update(schema.commerceOrders)
      .set({ paymentMethod: "Koko" })
      .where(eq(schema.commerceOrders.id, ORDER_A));
    expect(
      (await repo.dashboard(ORG_A, { ...filters, paymentMethod: "Koko" }))
        .total,
    ).toBe(55);
    expect(
      (await repo.dashboard(ORG_A, { ...filters, paymentMethod: "PayHere" }))
        .total,
    ).toBe(0);
    expect((await repo.dashboard(ORG_A, filters)).paymentMethods).toEqual([
      "Koko",
    ]);
  });
  it("excludes another tenant and other couriers", async () => {
    expect((await repo.dashboard(ORG_B, filters)).rows).toEqual([]);
    expect(
      (await repo.dashboard(ORG_A, { ...filters, search: "DOTHER" })).total,
    ).toBe(0);
    expect(
      await repo.trackingShipment(ORG_B, "unknown", "DTEST054"),
    ).toBeNull();
  });
});

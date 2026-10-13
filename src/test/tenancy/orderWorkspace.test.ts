import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  createTenancyFixture,
  ORG_A,
  ORG_B,
  ORDER_A,
  CONTACT_A,
  USER_OWNER_A,
  USER_OWNER_B,
} from "./fixture";
import type * as Repository from "@/server/features/commerce/repositories/OrderWorkspaceRepository";
import type * as Service from "@/server/features/commerce/services/OrderWorkspaceService";
import type * as Schema from "@/db/schema";
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
let fixture: Awaited<ReturnType<typeof createTenancyFixture>>;
let repo: typeof Repository.OrderWorkspaceRepository;
let service: typeof Service.OrderWorkspaceService;
let schema: typeof Schema;
beforeAll(async () => {
  fixture = await createTenancyFixture();
  vi.doMock("@/db", () => ({ db: fixture.db }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: fixture.db }));
  vi.doMock("@/db/pg/client", () => ({ pgDb: null }));
  schema = await import("@/db/schema");
  ({ OrderWorkspaceRepository: repo } =
    await import("@/server/features/commerce/repositories/OrderWorkspaceRepository"));
  ({ OrderWorkspaceService: service } =
    await import("@/server/features/commerce/services/OrderWorkspaceService"));
  await fixture.db
    .update(schema.commerceOrders)
    .set({
      customerName: "=Sensitive customer",
      customerPhone: "+94771111111",
      status: "draft",
      approvalStatus: "pending",
    })
    .where(eq(schema.commerceOrders.id, ORDER_A));
  await fixture.db.insert(schema.commerceOrderShipments).values([
    {
      id: "workspace_tracking_1",
      organizationId: ORG_A,
      orderId: ORDER_A,
      provider: "Citypak",
      trackingNumber: "DSEARCH",
      status: "PENDING",
    },
    {
      id: "workspace_tracking_2",
      organizationId: ORG_A,
      orderId: ORDER_A,
      provider: "Citypak",
      trackingNumber: "DSEARCH2",
      status: "DELIVERED",
    },
  ]);
  await fixture.db.insert(schema.commerceOrders).values([
    {
      id: "workspace_new",
      branchId: `default:${ORG_A}`,
      organizationId: ORG_A,
      orderNumber: "ORD-NEW",
      status: "confirmed",
      customerName: "Customer Two",
      createdAt: "2026-10-14T10:00:00.000Z",
    },
    {
      id: "workspace_refund",
      branchId: `default:${ORG_A}`,
      organizationId: ORG_A,
      orderNumber: "ORD-REFUND",
      status: "confirmed",
      paymentStatus: "refunded",
      createdAt: "2026-10-13T10:00:00.000Z",
    },
  ]);
});
afterAll(() => fixture.client.close());
describe("dense order workspace queries", () => {
  it("counts pending orders and searches tracking without duplicate joined rows", async () => {
    const result = await repo.page(ORG_A, {
      tab: "pending",
      search: "dsearch",
      limit: 50,
    });
    expect(result.total).toBe(1);
    expect(result.pendingCount).toBe(1);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].shipments).toHaveLength(2);
    expect(result.rows[0].lines.length).toBeGreaterThan(0);
    expect(result.rows[0].order.customerName).toBe("=Sensitive customer");
  });
  it("keeps customer, order, tracking and count data within the organization", async () => {
    const foreign = await service.page(ORG_B, USER_OWNER_B, {
      tab: "pending",
      search: "dsearch",
      limit: 50,
    });
    expect(foreign.rows).toEqual([]);
    expect(foreign.total).toBe(0);
    expect(foreign.pendingCount).toBe(0);
    expect(
      (await repo.customers(ORG_B, "")).some((row) => row.id === CONTACT_A),
    ).toBe(false);
    expect(
      (await repo.customers(ORG_A, "")).some((row) => row.id === CONTACT_A),
    ).toBe(true);
    expect(
      (await repo.customerHistory(ORG_A, CONTACT_A)).map((row) => row.id),
    ).toContain(ORDER_A);
    expect(await repo.customerHistory(ORG_B, CONTACT_A)).toEqual([]);
    await expect(
      service.page(ORG_A, USER_OWNER_B, { limit: 50 }),
    ).rejects.toThrow();
  });
  it("paginates summaries deterministically and finds refunds separately", async () => {
    const first = await service.page(ORG_A, USER_OWNER_A, {
      tab: "all",
      limit: 1,
      offset: 0,
    });
    const second = await repo.page(ORG_A, { tab: "all", limit: 1, offset: 1 });
    expect(first.rows[0].order.id).toBe("workspace_new");
    expect(second.rows[0].order.id).toBe("workspace_refund");
    expect(first.total).toBe(2);
    const refunded = await repo.page(ORG_A, { tab: "adjustments", limit: 50 });
    expect(refunded.rows.map((row) => row.order.id)).toEqual([
      "workspace_refund",
    ]);
  });
  it("retains spreadsheet formula safety in order CSV exports", async () => {
    const { buildCsv } = await import("@/client/lib/csv");
    const result = await repo.page(ORG_A, {
      tab: "pending",
      search: "+94771111111",
      limit: 50,
    });
    const csv = buildCsv(
      ["Customer", "Phone"],
      result.rows.map(({ order }) => [order.customerName, order.customerPhone]),
    );
    expect(csv).toContain("'=Sensitive customer");
    expect(csv).toContain("'+94771111111");
  });
});

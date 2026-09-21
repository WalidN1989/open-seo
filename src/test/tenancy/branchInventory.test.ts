import type * as OrderServiceModule from "@/server/features/commerce/services/OrderService";
import type * as InventoryRepositoryModule from "@/server/features/commerce/repositories/InventoryRepository";
import type * as InventoryServiceModule from "@/server/features/commerce/services/InventoryService";
import type * as BranchServiceModule from "@/server/features/commerce/services/BranchService";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  createTenancyFixture,
  ORG_A,
  ORG_B,
  USER_OWNER_A,
  USER_OWNER_B,
  USER_STAFF_A,
} from "./fixture";
import * as schema from "@/db/schema";

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
let fixture: Awaited<ReturnType<typeof createTenancyFixture>>;
let branches: typeof BranchServiceModule.BranchService;
let inventory: typeof InventoryServiceModule.InventoryService;
let repository: typeof InventoryRepositoryModule.InventoryRepository;
let orders: typeof OrderServiceModule.OrderService;
let second: string;
let third: string;
const home = `default:${ORG_A}`;

beforeAll(async () => {
  fixture = await createTenancyFixture();
  vi.doMock("@/db", () => ({ db: fixture.db }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: fixture.db }));
  vi.doMock("@/db/pg/client", () => ({ pgDb: null }));
  ({ BranchService: branches } =
    await import("@/server/features/commerce/services/BranchService"));
  ({ InventoryService: inventory } =
    await import("@/server/features/commerce/services/InventoryService"));
  ({ InventoryRepository: repository } =
    await import("@/server/features/commerce/repositories/InventoryRepository"));
  ({ OrderService: orders } =
    await import("@/server/features/commerce/services/OrderService"));
  second = (
    await branches.save(ORG_A, USER_OWNER_A, {
      name: "Branch B",
      city: "Melbourne",
      state: "VIC",
    })
  ).id;
  third = (await branches.save(ORG_A, USER_OWNER_A, { name: "Branch C" })).id;
});
afterAll(() => fixture?.client.close());

async function product() {
  const id = crypto.randomUUID();
  await fixture.db
    .insert(schema.commerceProducts)
    .values({ id, organizationId: ORG_A, sku: id, name: "Test book" });
  return id;
}
async function quantities(productId: string) {
  return (
    await branches.productStock(ORG_A, USER_OWNER_A, productId)
  ).branches.map((row) => ({
    id: row.branch.id,
    quantity: row.quantityOnHand,
  }));
}

describe("branch inventory on a real migrated database", () => {
  it("keeps branch management and stock isolated between organizations", async () => {
    expect(
      (await branches.list(ORG_B, USER_OWNER_B)).every(
        (row) => row.organizationId === ORG_B,
      ),
    ).toBe(true);
    await expect(
      branches.save(ORG_B, USER_OWNER_B, { id: second, name: "Wrong tenant" }),
    ).rejects.toThrow();
    const id = await product();
    await expect(
      branches.productStock(ORG_B, USER_OWNER_B, id),
    ).rejects.toThrow();
    await expect(
      inventory.adjustStock(ORG_A, USER_OWNER_A, {
        branchId: `default:${ORG_B}`,
        productId: id,
        quantityDelta: 2,
      }),
    ).rejects.toThrow();
    await expect(
      branches.save(ORG_A, USER_STAFF_A, { name: "No permission" }),
    ).rejects.toThrow();
  });

  it("transfers atomically, preserves total stock and retries once", async () => {
    const id = await product();
    await inventory.adjustStock(ORG_A, USER_OWNER_A, {
      productId: id,
      branchId: home,
      quantityDelta: 10,
    });
    const input = {
      productId: id,
      fromBranchId: home,
      toBranchId: second,
      quantity: 4,
      requestId: crypto.randomUUID(),
    };
    await branches.transfer(ORG_A, USER_OWNER_A, input);
    await branches.transfer(ORG_A, USER_OWNER_A, input);
    expect(await quantities(id)).toEqual(
      expect.arrayContaining([
        { id: home, quantity: 6 },
        { id: second, quantity: 4 },
        { id: third, quantity: null },
      ]),
    );
    await expect(
      branches.transfer(ORG_A, USER_OWNER_A, { ...input, toBranchId: third }),
    ).rejects.toThrow();
    await expect(
      branches.transfer(ORG_A, USER_OWNER_A, {
        ...input,
        quantity: 7,
        requestId: crypto.randomUUID(),
      }),
    ).rejects.toThrow();
    expect((await repository.getBalance(ORG_A, id, home))?.quantityOnHand).toBe(
      6,
    );
    expect(await repository.reconcileToQuantity(ORG_A, id, 10)).toBeNull();
  });

  it("rolls back every transfer leg if the write would oversell", async () => {
    const id = await product();
    await inventory.adjustStock(ORG_A, USER_OWNER_A, {
      productId: id,
      branchId: home,
      quantityDelta: 3,
    });
    await expect(
      repository.applyMovements(ORG_A, [
        {
          productId: id,
          branchId: second,
          quantityDelta: 4,
          movementType: "adjustment",
        },
        {
          productId: id,
          branchId: home,
          quantityDelta: -4,
          movementType: "adjustment",
        },
      ]),
    ).rejects.toThrow();
    expect(await repository.getBalance(ORG_A, id, second)).toBeNull();
    expect((await repository.getBalance(ORG_A, id, home))?.quantityOnHand).toBe(
      3,
    );
    expect(await repository.listMovements(ORG_A, id, 50, second)).toHaveLength(
      0,
    );
  });

  it("publishes and reverts only the counted branch and tracks a confirmed zero", async () => {
    const id = await product();
    await inventory.adjustStock(ORG_A, USER_OWNER_A, {
      productId: id,
      branchId: home,
      quantityDelta: 9,
    });
    const audit = await inventory.createAudit(ORG_A, USER_OWNER_A, {
      name: "Branch B count",
      branchId: second,
    });
    await inventory.recordAuditCount(ORG_A, USER_OWNER_A, {
      auditId: audit.id,
      productId: id,
      countedQuantity: 0,
    });
    await inventory.publishAudit(ORG_A, USER_OWNER_A, audit.id);
    expect(
      (await repository.getBalance(ORG_A, id, second))?.quantityOnHand,
    ).toBe(0);
    expect((await repository.getBalance(ORG_A, id, home))?.quantityOnHand).toBe(
      9,
    );
    await expect(
      inventory.publishAudit(ORG_A, USER_OWNER_A, audit.id),
    ).rejects.toThrow();
    await inventory.revertAudit(ORG_A, USER_OWNER_A, audit.id);
    expect((await repository.getBalance(ORG_A, id, home))?.quantityOnHand).toBe(
      9,
    );
    expect(
      (await inventory.listAudits(ORG_A, USER_OWNER_A, 50, home)).some(
        (row) => row.id === audit.id,
      ),
    ).toBe(false);
  });

  it("confirms and returns an order against its original branch", async () => {
    const id = await product();
    await inventory.adjustStock(ORG_A, USER_OWNER_A, {
      productId: id,
      branchId: second,
      quantityDelta: 5,
    });
    const order = await orders.createOrder(ORG_A, USER_OWNER_A, {
      branchId: second,
      lines: [
        {
          productId: id,
          description: "Second line of same product",
          quantity: 1,
          unitPriceMinor: 100,
        },
        {
          productId: id,
          description: "Book",
          quantity: 2,
          unitPriceMinor: 100,
        },
      ],
      discountMinor: 0,
      deliveryMinor: 0,
      taxMinor: 0,
    });
    await orders.confirmOrder(ORG_A, USER_OWNER_A, order.id);
    expect(
      (await repository.getBalance(ORG_A, id, second))?.quantityOnHand,
    ).toBe(2);
    expect(await repository.getBalance(ORG_A, id, home)).toBeNull();
    await orders.returnOrder(ORG_A, USER_OWNER_A, order.id);
    expect(
      (await repository.getBalance(ORG_A, id, second))?.quantityOnHand,
    ).toBe(5);
    expect(
      (
        await fixture.db
          .select()
          .from(schema.commerceOrders)
          .where(eq(schema.commerceOrders.id, order.id))
      )[0]?.branchId,
    ).toBe(second);
  });
});

it("offers the read-only stock tool to CRM-enabled voice sessions and matches state aliases", async () => {
  const { branchStockTool, commerceSurface } =
    await import("@/server/mcp/tools/branch-stock-tools");
  const { toVoiceTools } =
    await import("@/server/features/voice/tools/voiceToolShape");
  const { z } = await import("zod");
  const moduleMap = new Map([[branchStockTool.name, commerceSurface.key]]);
  expect(
    toVoiceTools([branchStockTool], new Set(["crm"]), moduleMap).map(
      (tool) => tool.name,
    ),
  ).toEqual(["find_branch_stock"]);
  expect(toVoiceTools([branchStockTool], new Set(), moduleMap)).toHaveLength(0);
  const id = await product();
  await inventory.adjustStock(ORG_A, USER_OWNER_A, {
    productId: id,
    branchId: second,
    quantityDelta: 3,
  });
  const context = {
    auth: {
      userId: USER_OWNER_A,
      userEmail: "owner-a@alpha.test",
      organizationId: ORG_A,
      scopes: ["mcp"],
      clientId: null,
      baseUrl: "http://localhost",
    },
  };
  const full = await branchStockTool.handler(
    { search: id, location: "Victoria" },
    context,
  );
  const short = await branchStockTool.handler(
    { search: id, location: "VIC" },
    context,
  );
  expect(full.structuredContent).toEqual(short.structuredContent);
  const parsed = z
    .object(branchStockTool.config.outputSchema)
    .parse(full.structuredContent);
  expect(parsed.products[0]?.branches).toEqual([
    expect.objectContaining({
      id: second,
      quantityOnHand: 3,
      availability: "in_stock",
    }),
  ]);
  await expect(
    branchStockTool.handler({ search: id, organizationId: ORG_B }, context),
  ).rejects.toThrow();
});

it("does not allow two simultaneous writes to oversell a branch", async () => {
  const id = await product();
  await inventory.adjustStock(ORG_A, USER_OWNER_A, {
    productId: id,
    branchId: second,
    quantityDelta: 3,
  });
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      repository.applyMovements(ORG_A, [
        {
          productId: id,
          branchId: second,
          movementType: "sale",
          quantityDelta: -2,
        },
      ]),
    ),
  );
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  expect((await repository.getBalance(ORG_A, id, second))?.quantityOnHand).toBe(
    1,
  );
  expect(await repository.listMovements(ORG_A, id, 50, second)).toHaveLength(2);
});

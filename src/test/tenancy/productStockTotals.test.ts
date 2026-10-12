import { afterAll, beforeAll, expect, it, vi } from "vitest";
import {
  commerceBranches,
  commerceInventoryBalances,
  commerceProducts,
} from "@/db/schema";
import type * as RepositoryModule from "@/server/features/commerce/repositories/CommerceRepository";
import { createTenancyFixture, ORG_A, ORG_B, PRODUCT_A } from "./fixture";

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
let fixture: Awaited<ReturnType<typeof createTenancyFixture>>;
let repository: typeof RepositoryModule.CommerceRepository;
beforeAll(async () => {
  fixture = await createTenancyFixture();
  vi.doMock("@/db", () => ({ db: fixture.db }));
  ({ CommerceRepository: repository } =
    await import("@/server/features/commerce/repositories/CommerceRepository"));
  await fixture.db
    .insert(commerceBranches)
    .values({ id: "second-a", organizationId: ORG_A, name: "Second" });
  await fixture.db.insert(commerceInventoryBalances).values([
    {
      id: "second-stock",
      organizationId: ORG_A,
      productId: PRODUCT_A,
      branchId: "second-a",
      quantityOnHand: 7,
    },
    // Deliberately malformed tenant relationship must not leak into totals.
    {
      id: "foreign-stock",
      organizationId: ORG_B,
      productId: PRODUCT_A,
      branchId: `default:${ORG_B}`,
      quantityOnHand: 900,
    },
  ]);
  await fixture.db.insert(commerceProducts).values({
    id: "no-stock",
    organizationId: ORG_A,
    sku: "EMPTY",
    name: "Empty product",
  });
});
afterAll(() => fixture?.client.close());

it("sums published balances across branches without including another tenant", async () => {
  const result = await repository.listProducts(ORG_A, { limit: 50, offset: 0 });
  expect(result.total).toBe(2);
  expect(result.products).toHaveLength(2);
  expect(
    result.products.find((product) => product.id === PRODUCT_A)?.quantityOnHand,
  ).toBe(47);
  expect(
    result.products.find((product) => product.id === "no-stock")
      ?.quantityOnHand,
  ).toBe(0);
  expect(
    result.products.every((product) => product.organizationId === ORG_A),
  ).toBe(true);
});

it("preserves filtering, pagination and numeric totals", async () => {
  const filtered = await repository.listProducts(ORG_A, {
    limit: 1,
    offset: 0,
    search: "ALPHA",
  });
  expect(filtered.total).toBe(1);
  expect(filtered.products[0]?.quantityOnHand).toBe(47);
  const page = await repository.listProducts(ORG_A, { limit: 1, offset: 1 });
  expect(page.total).toBe(2);
  expect(page.products.map((product) => product.id)).toEqual(["no-stock"]);
  const foreign = await repository.listProducts(ORG_B, {
    limit: 50,
    offset: 0,
  });
  expect(foreign.products).toHaveLength(1);
  expect(foreign.products[0]?.quantityOnHand).toBe(70);
});

import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { commerceProducts, commerceInventoryBalances } from "@/db/schema";
import type * as CommerceModule from "@/server/features/commerce/repositories/CommerceRepository";
import type * as AssistantModule from "@/server/features/communications/repositories/WhatsappAssistantRepository";
import type * as VoiceModule from "@/server/features/communications/services/VoiceAgentContext";
import { createTenancyFixture, ORG_A, ORG_B, PRODUCT_A } from "./fixture";

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
let fixture: Awaited<ReturnType<typeof createTenancyFixture>>;
let commerce: typeof CommerceModule.CommerceRepository;
let assistant: typeof AssistantModule.WhatsappAssistantRepository;
let voice: typeof VoiceModule.buildVoiceAgentContext;

beforeAll(async () => {
  fixture = await createTenancyFixture();
  vi.doMock("@/db", () => ({ db: fixture.db }));
  ({ CommerceRepository: commerce } =
    await import("@/server/features/commerce/repositories/CommerceRepository"));
  ({ WhatsappAssistantRepository: assistant } =
    await import("@/server/features/communications/repositories/WhatsappAssistantRepository"));
  ({ buildVoiceAgentContext: voice } =
    await import("@/server/features/communications/services/VoiceAgentContext"));
});
afterAll(() => fixture?.client.close());

it("archives only the matching tenant/provider import, hides it from all AI catalogue reads, and safely reactivates on publication", async () => {
  await fixture.db
    .update(commerceProducts)
    .set({
      name: "Blue Draft Book",
      externalSource: "woocommerce",
      externalId: "101",
      productUrl: "https://store.example.test/?p=101",
    })
    .where(eq(commerceProducts.id, PRODUCT_A));
  await fixture.db.insert(commerceProducts).values([
    {
      id: "foreign-woo",
      organizationId: ORG_B,
      name: "Foreign",
      sku: "foreign-woo",
      externalSource: "woocommerce",
      externalId: "101",
    },
    {
      id: "shopify-book",
      organizationId: ORG_A,
      name: "Shopify",
      sku: "shopify-book",
      externalSource: "shopify",
      externalId: "101",
    },
    {
      id: "local-book",
      organizationId: ORG_A,
      name: "Local",
      sku: "local-book",
    },
  ]);
  const before = await commerce.getProduct(ORG_A, PRODUCT_A);
  if (!before) throw new Error("missing fixture product");
  const balancesBefore = await fixture.db
    .select()
    .from(commerceInventoryBalances);
  expect(
    await assistant.searchPricedProducts(ORG_A, "Blue Draft"),
  ).toHaveLength(1);

  await commerce.archiveExternalProducts(ORG_A, "woocommerce", [
    "101",
    "not-imported",
  ]);
  await commerce.archiveExternalProducts(ORG_A, "woocommerce", ["101"]);
  await commerce.archiveExternalProducts(ORG_A, "woocommerce", []);
  expect(await commerce.getProduct(ORG_A, PRODUCT_A)).toMatchObject({
    status: "archived",
    productUrl: null,
    salePriceMinor: before.salePriceMinor,
  });
  expect(await assistant.searchPricedProducts(ORG_A, "Blue Draft")).toEqual([]);
  expect(
    (await assistant.listPricedProducts(ORG_A)).products.map((row) => row.name),
  ).not.toContain("Blue Draft Book");
  expect(await voice(ORG_A, "test-agent", "Blue Draft")).not.toContain(
    "Blue Draft Book",
  );
  expect(await commerce.getProduct(ORG_B, "foreign-woo")).toMatchObject({
    status: "active",
  });
  expect(await commerce.getProduct(ORG_A, "shopify-book")).toMatchObject({
    status: "active",
  });
  expect(await commerce.getProduct(ORG_A, "local-book")).toMatchObject({
    status: "active",
  });
  expect(await fixture.db.select().from(commerceInventoryBalances)).toEqual(
    balancesBefore,
  );

  const revived = await commerce.upsertExternalProduct(ORG_A, {
    externalSource: "woocommerce",
    externalId: "101",
    sku: before.sku,
    name: "Blue Published Book",
    description: null,
    category: null,
    salePriceMinor: 2590,
    productUrl: "https://store.example.test/product/blue-book/",
    status: "active",
  });
  expect(revived).toMatchObject({
    id: PRODUCT_A,
    status: "active",
    productUrl: "https://store.example.test/product/blue-book/",
  });
  expect(
    await assistant.searchPricedProducts(ORG_A, "Blue Published"),
  ).toHaveLength(1);
  expect(await fixture.db.select().from(commerceInventoryBalances)).toEqual(
    balancesBefore,
  );

  // Other adapters still preserve a locally archived status on normal upsert.
  await commerce.updateProduct(ORG_A, {
    id: "shopify-book",
    status: "archived",
  });
  expect(
    await commerce.upsertExternalProduct(ORG_A, {
      externalSource: "shopify",
      externalId: "101",
      sku: "shopify-book",
      name: "Shopify",
      description: null,
      category: null,
      salePriceMinor: 100,
      productUrl: null,
    }),
  ).toMatchObject({ id: "shopify-book", status: "archived" });
});

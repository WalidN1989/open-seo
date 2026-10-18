import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import * as schema from "@/db/business.schema";
import { citypakSenderSchema } from "@/types/schemas/orderReview";
const state = vi.hoisted(() => ({ db: null as unknown, access: vi.fn() }));
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
vi.mock("@/db", () => ({
  get db() {
    return state.db;
  },
}));
vi.mock("@/db/schema", async () => import("@/db/business.schema"));
vi.mock(
  "@/server/features/business-modules/services/BusinessModuleService",
  () => ({ BusinessModuleService: { requireAccess: state.access } }),
);
vi.mock("@/server/lib/connection-secrets", () => ({
  decryptCredentials: async () => ({ API_KEY: "synthetic-test-key" }),
}));
import { OrderOperationsConfigService } from "./OrderOperationsConfigService";
import { OrderOperationsRepository } from "../repositories/OrderOperationsRepository";
const client = createClient({ url: ":memory:" });
const sender = {
  connectionId: "shop-a",
  senderName: "Synthetic Books",
  senderContactName: "Test Staff",
  senderPhone: "+94770000001",
  senderAltPhone: "+94110000001",
  senderAddress1: "1 Example Road",
  senderAddress2: "Example Building",
  senderAddress3: null,
  senderCity: "Example City",
  parcelWeightGrams: 750,
};
beforeAll(async () => {
  state.db = drizzle(client);
  const config = getTableConfig(schema.commerceOrderSync);
  await client.execute(
    `create table "${config.name}" (${config.columns.map((c) => `"${c.name}" ${c.getSQLType()}`).join(",")})`,
  );
});
afterAll(() => client.close());
beforeEach(async () => {
  state.access.mockResolvedValue(undefined);
  await client.execute("delete from commerce_order_sync");
  await client.execute(
    "insert into commerce_order_sync (connection_id,organization_id,enabled,courier_credentials,operations_started_at,confirmation_started_at,invoice_enabled,loyalty_minor_per_point,parcel_weight_grams,sender_name,sender_phone,sender_address_1,sender_city) values ('shop-a','org-a',1,'encrypted-test-value',null,null,0,0,500,'Original','+94770000000','Original Road','Original City')",
  );
});
describe("Citypak sender settings", () => {
  it("saves sender fields without enabling operations or changing credentials and other automation settings", async () => {
    const before = await OrderOperationsRepository.configuration(
      "org-a",
      "shop-a",
    );
    await OrderOperationsConfigService.saveSender(
      "org-a",
      "manager",
      citypakSenderSchema.parse(sender),
    );
    const after = await OrderOperationsRepository.configuration(
      "org-a",
      "shop-a",
    );
    const { connectionId: _connectionId, ...values } = sender;
    expect(after).toEqual({ ...before, ...values });
    expect(state.access.mock.calls).toEqual([
      ["org-a", "manager", "integrations", "manage"],
      ["org-a", "manager", "crm", "manage"],
    ]);
  });
  it("refuses a connection belonging to another organization", async () => {
    await expect(
      OrderOperationsConfigService.saveSender("org-b", "manager", sender),
    ).rejects.toThrow();
    expect(
      (await OrderOperationsRepository.configuration("org-a", "shop-a"))
        ?.senderName,
    ).toBe("Original");
  });
  it("refuses staff without management access", async () => {
    state.access.mockRejectedValue(new Error("Forbidden"));
    await expect(
      OrderOperationsConfigService.saveSender("org-a", "viewer", sender),
    ).rejects.toThrow("Forbidden");
    expect(
      (await OrderOperationsRepository.configuration("org-a", "shop-a"))
        ?.senderName,
    ).toBe("Original");
  });
  it("never returns saved credentials in sender settings", async () => {
    const settings = await OrderOperationsConfigService.settings(
      "org-a",
      "manager",
      "shop-a",
    );
    expect(settings.courierConnected).toBe(true);
    expect(settings).not.toHaveProperty("courierCredentials");
    expect(JSON.stringify(settings)).not.toContain("encrypted-test-value");
    expect(JSON.stringify(settings)).not.toContain("synthetic-test-key");
  });
  it.each([
    { senderName: "" },
    { senderAddress1: "" },
    { senderCity: "" },
    { senderContactName: "සිංහල" },
    { senderAddress2: "පාර" },
    { senderPhone: "0770000001" },
    { senderAltPhone: "invalid" },
    { parcelWeightGrams: 0 },
    { parcelWeightGrams: 100001 },
    { parcelWeightGrams: 500.5 },
  ])("validates provider requirements: %o", (patch) => {
    expect(citypakSenderSchema.safeParse({ ...sender, ...patch }).success).toBe(
      false,
    );
  });
  it("accepts optional contact details and the documented maximum weight", () => {
    expect(
      citypakSenderSchema.safeParse({
        ...sender,
        senderContactName: null,
        senderAltPhone: null,
        senderAddress2: null,
        parcelWeightGrams: 100000,
      }).success,
    ).toBe(true);
  });
});

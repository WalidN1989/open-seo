import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { and, eq } from "drizzle-orm";
import {
  ORG_A,
  ORG_B,
  ORG_C,
  createTenancyFixture,
  type TestDb,
} from "./fixture";
import {
  generateSalt,
  hashAccessCode,
} from "@/server/features/clients/accessCode";
import type * as Schema from "@/db/schema";
import type * as Verification from "@/server/features/clients/services/ClientVerificationService";
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
let db: TestDb;
let close: () => void;
let schema: typeof Schema;
let resolve: typeof Verification.resolveClientAccess;
const CODE_A = "K7MN4PQR";
const CODE_B = "W4KD3TXR";
const PHONE = "+61400000999";

async function register(
  organizationId = ORG_A,
  clientOrganizationId = ORG_B,
  code = CODE_A,
) {
  const salt = generateSalt();
  await db.insert(schema.clientAccounts).values({
    id: `account_${organizationId}`,
    organizationId,
    clientOrganizationId,
    displayName: organizationId,
    status: "active",
    codeHash: await hashAccessCode(code, salt),
    codeSalt: salt,
  });
}
function access(body: string, organizationId = ORG_A, identifier = PHONE) {
  return resolve({ organizationId, identifier, body });
}
async function events() {
  return db.select().from(schema.clientAccessEvents);
}

beforeAll(async () => {
  const fixture = await createTenancyFixture();
  db = fixture.db;
  close = () => fixture.client.close();
  vi.doMock("@/db", () => ({ db }));
  schema = await import("@/db/schema");
  ({ resolveClientAccess: resolve } =
    await import("@/server/features/clients/services/ClientVerificationService"));
  for (const organizationId of [ORG_A, ORG_B]) {
    await db.insert(schema.organizationModuleEntitlements).values({
      id: `clients_${organizationId}`,
      organizationId,
      moduleKey: "clients",
      status: "enabled",
    });
  }
});
beforeEach(async () => {
  await db.delete(schema.clientAccessEvents);
  await db.delete(schema.clientContacts);
  await db.delete(schema.clientAccounts);
  await db
    .update(schema.organizationModuleEntitlements)
    .set({ status: "enabled" })
    .where(eq(schema.organizationModuleEntitlements.moduleKey, "clients"));
});
afterEach(() => vi.useRealTimers());
afterAll(() => close());

describe("private SEO verification eligibility", () => {
  it("does not offer verification without an active issued client account", async () => {
    expect(await access(`/verify ${CODE_A}`)).toEqual({ kind: "unavailable" });
    expect(await events()).toEqual([]);
  });
  it("never verifies or records failures for a retail workspace without the module", async () => {
    await register();
    await db
      .update(schema.organizationModuleEntitlements)
      .set({ status: "disabled" })
      .where(
        and(
          eq(schema.organizationModuleEntitlements.organizationId, ORG_A),
          eq(schema.organizationModuleEntitlements.moduleKey, "clients"),
        ),
      );
    for (const body of [
      "I need it by next week",
      "SHOP-6603",
      `/verify ${CODE_A}`,
      "/verify K7MN-4PQQ",
    ]) {
      expect(await access(body)).toEqual({ kind: "unavailable" });
    }
    expect(await events()).toEqual([]);
    expect(await db.select().from(schema.clientContacts)).toEqual([]);
  });
  it("stops private access when the module is disabled, even for a verified number", async () => {
    await register();
    await access(`/verify ${CODE_A}`);
    await db
      .update(schema.organizationModuleEntitlements)
      .set({ status: "disabled" })
      .where(eq(schema.organizationModuleEntitlements.organizationId, ORG_A));
    expect(await access("How are my rankings?")).toEqual({
      kind: "unavailable",
    });
  });
  it("stops private access for a paused account", async () => {
    await register();
    await access(`/verify ${CODE_A}`);
    await db
      .update(schema.clientAccounts)
      .set({ status: "paused" })
      .where(eq(schema.clientAccounts.organizationId, ORG_A));
    expect(await access("How are my rankings?")).toEqual({
      kind: "unavailable",
    });
  });
});

describe("explicit submissions and lockout", () => {
  it("leaves ordinary phrases, order IDs and unsolicited codes alone without using attempts", async () => {
    await register();
    for (const body of [
      "I need it by next week",
      "next week",
      "send them",
      "FEEDBACK",
      "SHOP-6603",
      "OCITTEA59",
      CODE_A,
      "K7MN-4PQR",
    ]) {
      expect(await access(body)).toEqual({ kind: "anonymous" });
    }
    expect(await events()).toEqual([]);
    expect(await db.select().from(schema.clientContacts)).toEqual([]);
  });
  it("verifies an explicit valid code and recognizes later messages without re-verification", async () => {
    await register();
    expect(await access(`/verify ${CODE_A}`)).toMatchObject({
      kind: "just_verified",
      clientOrganizationId: ORG_B,
    });
    expect(await access("How are my rankings?")).toMatchObject({
      kind: "verified",
      clientOrganizationId: ORG_B,
    });
    expect((await events()).map((e) => e.kind)).toEqual(["verified"]);
  });
  it("locks only explicit wrong submissions, permits ordinary chat, and expires the lockout", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-22T12:00:00Z"));
    await register();
    for (let i = 0; i < 5; i++)
      expect(await access("/verify K7MN-4PQQ")).toEqual({
        kind: "rejected",
        remaining: 4 - i,
      });
    expect(await access(`/verify ${CODE_A}`)).toEqual({ kind: "locked" });
    expect(await access("I need it by next week")).toEqual({
      kind: "anonymous",
    });
    expect((await events()).filter((e) => e.kind === "rejected")).toHaveLength(
      5,
    );
    vi.setSystemTime(new Date("2026-10-22T12:16:00Z"));
    expect(await access(`/verify ${CODE_A}`)).toMatchObject({
      kind: "just_verified",
    });
  });
  it("allows a revoked contact to verify again without duplicating the binding", async () => {
    await register();
    await access(`/verify ${CODE_A}`);
    await db
      .update(schema.clientContacts)
      .set({ revokedAt: new Date().toISOString() });
    expect(await access("How are my rankings?")).toEqual({ kind: "anonymous" });
    expect(await access(`/verify ${CODE_A}`)).toMatchObject({
      kind: "just_verified",
    });
    const rows = await db.select().from(schema.clientContacts);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.revokedAt).toBeNull();
  });
});

describe("organization isolation", () => {
  it("binds the same phone independently to each agency and reads only that binding", async () => {
    await register();
    await register(ORG_B, ORG_C, CODE_B);
    expect(await access(`/verify ${CODE_A}`)).toMatchObject({
      kind: "just_verified",
      clientOrganizationId: ORG_B,
    });
    expect(await access(`/verify ${CODE_B}`, ORG_B)).toMatchObject({
      kind: "just_verified",
      clientOrganizationId: ORG_C,
    });
    expect(await access("rankings", ORG_B)).toMatchObject({
      kind: "verified",
      clientOrganizationId: ORG_C,
    });
    expect(await access("rankings", ORG_A)).toMatchObject({
      kind: "verified",
      clientOrganizationId: ORG_B,
    });
    expect(await db.select().from(schema.clientContacts)).toHaveLength(2);
  });
  it("does not apply another agency's failures or lockout to the same phone", async () => {
    await register();
    await register(ORG_B, ORG_C, CODE_B);
    for (let i = 0; i < 5; i++) await access("/verify K7MN-4PQQ");
    expect(await access(`/verify ${CODE_A}`)).toEqual({ kind: "locked" });
    expect(await access("/verify K7MN-4PQQ", ORG_B)).toEqual({
      kind: "rejected",
      remaining: 4,
    });
    expect(await access(`/verify ${CODE_B}`, ORG_B)).toMatchObject({
      kind: "just_verified",
      clientOrganizationId: ORG_C,
    });
  });
  it("ignores rejected events from another channel", async () => {
    await register();
    for (let i = 0; i < 5; i++)
      await db.insert(schema.clientAccessEvents).values({
        id: crypto.randomUUID(),
        organizationId: ORG_A,
        channel: "email",
        identifier: PHONE,
        kind: "rejected",
        createdAt: new Date().toISOString(),
      });
    expect(await access(`/verify ${CODE_A}`)).toMatchObject({
      kind: "just_verified",
    });
  });
  it("cannot use another agency's code or a mismatched stored contact", async () => {
    await register();
    await register(ORG_B, ORG_C, CODE_B);
    await db.insert(schema.clientContacts).values({
      id: "inconsistent_contact",
      organizationId: ORG_A,
      clientAccountId: `account_${ORG_B}`,
      identifier: PHONE,
    });
    expect(await access("rankings")).toEqual({ kind: "anonymous" });
    expect(await access(`/verify ${CODE_B}`)).toEqual({
      kind: "rejected",
      remaining: 4,
    });
    expect(
      (await db.select().from(schema.clientContacts))[0]?.lastSeenAt,
    ).toBeNull();
  });
});

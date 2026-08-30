import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  ORG_A,
  ORG_C,
  USER_OWNER_A,
  USER_OWNER_B,
  USER_OWNER_C,
  USER_STAFF_A,
  createTenancyFixture,
} from "./fixture";
import { expectDenied } from "./expectDenied";
import type * as BusinessModuleServiceModule from "@/server/features/business-modules/services/BusinessModuleService";

const mockEnv = vi.hoisted(
  () =>
    ({ DATABASE_PROVIDER: "d1" }) as {
      DATABASE_PROVIDER: string;
      AUTH_MODE?: string;
    },
);
vi.mock("cloudflare:workers", () => ({ env: mockEnv }));

let BusinessModuleService: typeof BusinessModuleServiceModule.BusinessModuleService;

beforeAll(async () => {
  const { db } = await createTenancyFixture();
  vi.doMock("@/db", () => ({ db, withPgClient: (fn: () => unknown) => fn() }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: db }));
  vi.doMock("@/db/pg/client", () => ({ pgDb: null }));
  ({ BusinessModuleService } =
    await import("@/server/features/business-modules/services/BusinessModuleService"));
});

/**
 * Entitlement and permission are separate gates. A tenant may own a module it
 * has not granted a member, and a member may hold a permission for a module
 * the tenant has not enabled. Both must be checked, in that order.
 */
describe("module entitlement", () => {
  it("allows a member of an entitled organization", async () => {
    await expect(
      BusinessModuleService.requireAccess(ORG_A, USER_OWNER_A, "crm"),
    ).resolves.not.toThrow();
  });

  it("refuses a module the organization is not entitled to", async () => {
    // Tenant C has no entitlements at all.
    await expectDenied(() =>
      BusinessModuleService.requireAccess(ORG_C, USER_OWNER_C, "crm"),
    );
  });

  it("refuses a user who is not a member of the organization", async () => {
    await expectDenied(() =>
      BusinessModuleService.requireAccess(ORG_A, USER_OWNER_B, "crm"),
    );
  });
});

describe("staff permission rank", () => {
  it("allows view when the member holds view", async () => {
    await expect(
      BusinessModuleService.requireAccess(ORG_A, USER_STAFF_A, "crm", "view"),
    ).resolves.not.toThrow();
  });

  it("refuses manage when the member holds only view", async () => {
    await expectDenied(() =>
      BusinessModuleService.requireAccess(ORG_A, USER_STAFF_A, "crm", "manage"),
    );
  });

  it("refuses admin when the member holds only manage", async () => {
    await expectDenied(() =>
      BusinessModuleService.requireAccess(
        ORG_A,
        USER_STAFF_A,
        "leads",
        "admin",
      ),
    );
  });

  it("allows manage when the member holds manage", async () => {
    await expect(
      BusinessModuleService.requireAccess(
        ORG_A,
        USER_STAFF_A,
        "leads",
        "manage",
      ),
    ).resolves.not.toThrow();
  });

  it("refuses a module the member has no permission row for", async () => {
    // Integrations is entitled to the organization but never granted to staff.
    await expectDenied(() =>
      BusinessModuleService.requireAccess(ORG_A, USER_STAFF_A, "integrations"),
    );
  });

  it("allows an owner holding admin", async () => {
    await expect(
      BusinessModuleService.requireAccess(
        ORG_A,
        USER_OWNER_A,
        "integrations",
        "admin",
      ),
    ).resolves.not.toThrow();
  });
});

import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import {
  CONTACT_A,
  LEAD_A,
  ORG_A,
  ORG_B,
  USER_OWNER_A,
  USER_OWNER_B,
  createTenancyFixture,
  type TestDb,
} from "./fixture";
import { expectDenied } from "./expectDenied";
import type * as BriefingServiceModule from "@/server/features/crm/services/BriefingService";

// Real in-memory SQLite, migrated from drizzle/, as in crossTenantAccess.
const mockEnv = vi.hoisted(() => ({ DATABASE_PROVIDER: "d1" }));
vi.mock("cloudflare:workers", () => ({ env: mockEnv }));

let BriefingService: typeof BriefingServiceModule.BriefingService;
let db: TestDb;

beforeAll(async () => {
  const fixture = await createTenancyFixture();
  db = fixture.db;
  const now = new Date().toISOString();
  await db.insert(schema.quotes).values({
    id: "quote_briefing_a",
    organizationId: ORG_A,
    number: "QUO-0100",
    status: "sent",
    leadId: LEAD_A,
    contactId: CONTACT_A,
    clientName: "Alpha Client",
    clientEmail: "client@alpha.test",
    currency: "AUD",
    issueDate: now.slice(0, 10),
    validUntil: new Date(Date.now() + 3 * 86_400_000)
      .toISOString()
      .slice(0, 10),
    totalMinor: 7900,
    sentAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    createdAt: now,
    updatedAt: now,
  });
  vi.doMock("@/db", () => ({ db, withPgClient: (fn: () => unknown) => fn() }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: db }));
  vi.doMock("@/db/pg/client", () => ({ pgDb: null }));
  ({ BriefingService } =
    await import("@/server/features/crm/services/BriefingService"));
});

describe("business briefing", () => {
  it("reads every part of the workspace and shows its own quotes", async () => {
    const briefing = await BriefingService.getBriefing(ORG_A, USER_OWNER_A, 12);
    expect(briefing.waitingOnCustomers.join("\n")).toContain("QUO-0100");
    expect(briefing.needsYou.join("\n")).toContain(
      "QUO-0100 for Alpha Client expires",
    );
  });

  it("never shows another workspace's quotes", async () => {
    const briefing = await BriefingService.getBriefing(
      ORG_B,
      USER_OWNER_B,
      168,
    );
    expect(briefing.text).not.toContain("QUO-0100");
  });

  it("is refused to someone outside the workspace", async () => {
    await expectDenied(() =>
      BriefingService.getBriefing(ORG_A, USER_OWNER_B, 12),
    );
  });
});

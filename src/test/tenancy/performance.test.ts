import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import {
  createTenancyFixture,
  ORG_A,
  ORG_B,
  USER_OWNER_A,
  USER_STAFF_A,
  USER_CONSULTANT,
  PROJECT_A1,
  PROJECT_B1,
  type TestDb,
} from "./fixture";
import type * as Performance from "@/server/features/performance/service";

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
const env = vi.hoisted(() => ({ values: new Map<string, string>() }));
vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: (name: string) => Promise.resolve(env.values.get(name)),
}));
const engineering = vi.hoisted(() => ({ read: vi.fn().mockResolvedValue([]) }));
vi.mock("@/server/features/performance/providers/engineering", () => ({
  engineeringSignals: engineering.read,
}));
let db: TestDb;
let service: typeof Performance;
let close: () => void;
const identity = {
  userId: USER_OWNER_A,
  userEmail: "owner-a@alpha.test",
  emailVerified: true,
};

beforeAll(async () => {
  const fixture = await createTenancyFixture();
  db = fixture.db;
  close = () => fixture.client.close();
  vi.doMock("@/db", () => ({ db }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: db }));
  vi.doMock("@/db/pg/client", () => ({ pgDb: null }));
  service = await import("@/server/features/performance/service");
  await db.insert(schema.organizationModuleEntitlements).values({
    id: "performance_email",
    organizationId: ORG_A,
    moduleKey: "email",
    status: "enabled",
  });
  await db.insert(schema.emailAccounts).values({
    id: "performance_account",
    organizationId: ORG_A,
    provider: "agentmail",
    address: "private@alpha.test",
    status: "connected",
    lastError: "secret-token-must-not-leak",
  });
  await db.insert(schema.emailThreads).values({
    id: "performance_thread",
    externalThreadId: "external-performance-thread",
    organizationId: ORG_A,
    accountId: "performance_account",
    subject: "Alpha inbox",
    lastDirection: "inbound",
    status: "open",
  });
  await db.insert(schema.emailMessages).values(
    Array.from({ length: 25 }, (_, i) => ({
      id: `performance_message_${i}`,
      organizationId: ORG_A,
      accountId: "performance_account",
      threadId: "performance_thread",
      direction: "inbound",
      status: "received",
      fromAddress: "customer@alpha.test",
      subject: `Alpha message ${i}`,
      textBody: "private-message-body",
      occurredAt: new Date(Date.now() - 60_000).toISOString().replace("T", " "),
    })),
  );
});
afterAll(() => close());

describe("Performance access and exact counts", () => {
  it("counts shared organizations once, counts beyond the activity limit, excludes other tenants and secrets", async () => {
    const result = await service.getOverview(identity, {});
    expect(result.activeProjectCount).toBe(2);
    expect(result.organizationCount).toBe(1);
    expect(result.metrics.find((m) => m.key === "email_inbound")?.count).toBe(
      25,
    );
    expect(result.activity.filter((r) => r.kind === "email")).toHaveLength(10);
    expect(result.projects.every((p) => p.organizationId === ORG_A)).toBe(true);
    expect(result.engineering).toBeNull();
    expect(result.latestEmail?.timestamp).toMatch(/Z$/);
    expect(engineering.read).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(
      /secret-token|private-message-body|org_beta/,
    );
    expect(
      result.attention.some(
        (r) => r.id === "email-account:performance_account",
      ),
    ).toBe(true);
  });
  it("validates project scope before reading or calling providers", async () => {
    await expect(
      service.getOverview(identity, { projectId: PROJECT_B1 }),
    ).rejects.toThrow();
    const result = await service.getOverview(identity, {
      projectId: PROJECT_A1,
    });
    expect(result.activeProjectCount).toBe(1);
    expect(result.metrics.find((m) => m.key === "email_inbound")?.count).toBe(
      25,
    );
  });
  it("requires module permission in each organization", async () => {
    const result = await service.getOverview(
      { ...identity, userId: USER_STAFF_A },
      {},
    );
    expect(result.metrics.some((m) => m.key.startsWith("email"))).toBe(false);
    expect(result.connections.some((c) => c.kind === "email")).toBe(false);
    const consultant = await service.getOverview(
      { ...identity, userId: USER_CONSULTANT },
      {},
    );
    expect(consultant.projects.some((p) => p.organizationId === ORG_B)).toBe(
      true,
    );
    expect(consultant.connections.some((c) => c.kind === "email")).toBe(false);
  });
  it("does not expose disabled modules even to an owner", async () => {
    await db
      .update(schema.organizationModuleEntitlements)
      .set({ status: "disabled" })
      .where(
        and(
          eq(schema.organizationModuleEntitlements.organizationId, ORG_A),
          eq(schema.organizationModuleEntitlements.moduleKey, "email"),
        ),
      );
    const result = await service.getOverview(identity, {});
    expect(result.metrics.some((m) => m.key.startsWith("email"))).toBe(false);
  });
  it("requires verified operator allowlisting, and refuses client logins even if allowlisted", async () => {
    engineering.read.mockResolvedValue([]);
    env.values.set("PERFORMANCE_OPERATOR_EMAILS", identity.userEmail);
    expect(
      (await service.getOverview({ ...identity, emailVerified: false }, {}))
        .engineering,
    ).toBeNull();
    expect((await service.getOverview(identity, {})).engineering).toEqual([]);
    engineering.read.mockClear();
    await db.insert(schema.clientLogins).values({
      id: "performance_client",
      organizationId: ORG_A,
      userId: USER_OWNER_A,
    });
    expect((await service.getOverview(identity, {})).engineering).toBeNull();
    expect(engineering.read).not.toHaveBeenCalled();
    env.values.clear();
  });
});

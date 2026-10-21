import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import {
  createTenancyFixture,
  ORG_A,
  ORG_B,
  USER_OWNER_A,
  USER_OWNER_B,
  USER_STAFF_A,
  type TestDb,
} from "./fixture";
import { createSmsCampaignDraftSchema } from "@/types/schemas/sms-campaigns";
import type * as Service from "@/server/features/sms/services/SmsCampaignDraftService";
import type { Client } from "@libsql/client";
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
let db: TestDb;
let client: Client;
let service: typeof Service.SmsCampaignDraftService;
const draft = {
  connectionId: "fitsms-a",
  name: "Weekly books",
  kind: "weekly" as const,
  senderId: "BooXworm.lk",
  message: "This week's book offer",
  audienceDescription: "Customers who opted in to book promotions",
  firstSendDate: "2026-11-01",
  sendTime: "10:00",
  timezone: "Asia/Colombo" as const,
};
beforeAll(async () => {
  ({ db, client } = await createTenancyFixture());
  vi.doMock("@/db", () => ({ db }));
  const schema = await import("@/db/schema");
  await db.insert(schema.integrationConnections).values([
    {
      id: "fitsms-a",
      organizationId: ORG_A,
      providerKey: "fitsms",
      displayName: "Alpha FITSMS",
    },
    {
      id: "fitsms-b",
      organizationId: ORG_B,
      providerKey: "fitsms",
      displayName: "Beta FITSMS",
    },
  ]);
  ({ SmsCampaignDraftService: service } =
    await import("@/server/features/sms/services/SmsCampaignDraftService"));
});
afterAll(() => client?.close());

describe("FITSMS campaign preparation", () => {
  it("saves and reloads a draft without a network request or executable schedule", async () => {
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("No network allowed"));
    const saved = await service.create(ORG_A, USER_OWNER_A, draft);
    expect(saved).toMatchObject({ ...draft, organizationId: ORG_A });
    expect(saved).not.toHaveProperty("approvedAt");
    expect(saved).not.toHaveProperty("status");
    expect(await service.list(ORG_A, USER_OWNER_A, "fitsms-a")).toEqual([
      saved,
    ]);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not expose another organization's drafts", async () => {
    expect(await service.list(ORG_B, USER_OWNER_B, "fitsms-b")).toEqual([]);
    await expect(service.list(ORG_B, USER_OWNER_B, "fitsms-a")).rejects.toThrow(
      "FITSMS connection not found.",
    );
  });
  it("rejects a connection owned by another organization", async () => {
    await expect(
      service.create(ORG_A, USER_OWNER_A, {
        ...draft,
        connectionId: "fitsms-b",
      }),
    ).rejects.toThrow("FITSMS connection not found.");
  });
  it("refuses a non-FITSMS connection", async () => {
    await expect(
      service.create(ORG_A, USER_OWNER_A, {
        ...draft,
        connectionId: "integration_a",
      }),
    ).rejects.toThrow("FITSMS connection not found.");
  });
  it("requires module permission to save or read drafts", async () => {
    await expect(service.create(ORG_A, USER_STAFF_A, draft)).rejects.toThrow();
    await expect(
      service.list(ORG_A, USER_OWNER_B, "fitsms-a"),
    ).rejects.toThrow();
  });
  it("rejects an injected approval or activation flag", async () => {
    expect(
      createSmsCampaignDraftSchema.safeParse({
        ...draft,
        approved: true,
        status: "scheduled",
      }).success,
    ).toBe(false);
    await expect(
      service.create(ORG_A, USER_OWNER_A, {
        ...draft,
        approved: true,
      } as typeof draft),
    ).rejects.toThrow();
  });
  it("accepts flash discounts but rejects invalid timing and sender values", () => {
    expect(
      createSmsCampaignDraftSchema.safeParse({ ...draft, kind: "flash" })
        .success,
    ).toBe(true);
    for (const patch of [
      { firstSendDate: "2026-02-30" },
      { sendTime: "25:00" },
      { timezone: "Asia/Dubai" },
      { senderId: "long-sender-name" },
    ]) {
      expect(
        createSmsCampaignDraftSchema.safeParse({ ...draft, ...patch }).success,
      ).toBe(false);
    }
  });
});

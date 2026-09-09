import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  ORG_A,
  ORG_B,
  ORG_C,
  PROJECT_A1,
  PROJECT_B1,
  createTenancyFixture,
  type TestDb,
} from "./fixture";
import type * as ClientDataModule from "@/server/features/clients/services/ClientDataService";
import type * as DbSchema from "@/db/schema";

const mockEnv = vi.hoisted(
  () => ({ DATABASE_PROVIDER: "d1" }) as { DATABASE_PROVIDER: string },
);
vi.mock("cloudflare:workers", () => ({ env: mockEnv }));

let db: TestDb;
let schema: typeof DbSchema;
let readClientData: typeof ClientDataModule.readClientData;

beforeAll(async () => {
  const fixture = await createTenancyFixture();
  db = fixture.db;
  vi.doMock("@/db", () => ({ db, withPgClient: (fn: () => unknown) => fn() }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: db }));
  vi.doMock("@/db/pg/client", () => ({ pgDb: null }));
  ({ readClientData } =
    await import("@/server/features/clients/services/ClientDataService"));
  schema = await import("@/db/schema");

  // One keyword for each of two different organizations, with wording that
  // could only have come from one of them.
  await db.insert(schema.savedKeywords).values([
    {
      id: "kw_alpha",
      projectId: PROJECT_A1,
      keyword: "alpha-only-secret-keyword",
      locationCode: 2036,
      languageCode: "en",
    },
    {
      id: "kw_beta",
      projectId: PROJECT_B1,
      keyword: "beta-only-secret-keyword",
      locationCode: 2036,
      languageCode: "en",
    },
  ]);
  await db.insert(schema.backlinkSnapshots).values([
    {
      projectId: PROJECT_A1,
      domain: "alpha-one.test",
      backlinks: 111,
      referringDomains: 11,
      capturedAt: new Date().toISOString(),
    },
    {
      projectId: PROJECT_B1,
      domain: "beta-one.test",
      backlinks: 222,
      referringDomains: 22,
      capturedAt: new Date().toISOString(),
    },
  ]);
});

describe("what a verified client can read", () => {
  it("reads its own organization and never another's", async () => {
    const alpha = await readClientData(ORG_A, "keywords");
    expect(alpha).toContain("alpha-only-secret-keyword");
    expect(alpha).not.toContain("beta-only-secret-keyword");

    const beta = await readClientData(ORG_B, "keywords");
    expect(beta).toContain("beta-only-secret-keyword");
    expect(beta).not.toContain("alpha-only-secret-keyword");
  });

  it("keeps every topic inside the organization it was given", async () => {
    const beta = await Promise.all([
      readClientData(ORG_B, "overview"),
      readClientData(ORG_B, "backlinks"),
      readClientData(ORG_B, "rankings"),
      readClientData(ORG_B, "content"),
      readClientData(ORG_B, "site_health"),
    ]);
    const all = beta.join("\n");
    // Alpha's domains, names and numbers must appear nowhere in Beta's answers.
    expect(all).not.toContain("alpha-one.test");
    expect(all).not.toContain("alpha-two.test");
    expect(all).not.toContain("Alpha Site");
    expect(all).not.toContain("111");
    expect(all).toContain("beta-one.test");
  });

  it("says nothing rather than guessing for an organization with no data", async () => {
    const empty = await readClientData(ORG_C, "overview");
    expect(empty).toContain("No website");
    expect(empty).not.toContain("alpha");
    expect(empty).not.toContain("beta");
  });

  it("reports an archived project as gone", async () => {
    await db.insert(schema.projects).values({
      id: "project_c_archived",
      organizationId: ORG_C,
      name: "Gamma Retired",
      domain: "gamma-retired.test",
      slug: "gamma-retired",
      locationCode: 2036,
      languageCode: "en",
      archivedAt: new Date().toISOString(),
    });
    const overview = await readClientData(ORG_C, "overview");
    expect(overview).not.toContain("gamma-retired.test");
  });
});

import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  ORG_A,
  ORG_B,
  ORG_C,
  PROJECT_A1,
  PROJECT_A2,
  PROJECT_B1,
  createTenancyFixture,
  type TestDb,
} from "./fixture";
import type * as ProjectRepositoryModule from "@/server/features/projects/repositories/ProjectRepository";

// Real in-memory SQLite, migrated from drizzle/, so the organization filters
// in every repository run against actual SQL. Follows the mocking pattern
// established by src/server/auth/workspace-merge.test.ts.
const mockEnv = vi.hoisted(
  () =>
    ({ DATABASE_PROVIDER: "d1" }) as {
      DATABASE_PROVIDER: string;
      AUTH_MODE?: string;
    },
);
vi.mock("cloudflare:workers", () => ({ env: mockEnv }));

let db: TestDb;
let ProjectRepository: typeof ProjectRepositoryModule.ProjectRepository;

beforeAll(async () => {
  const fixture = await createTenancyFixture();
  db = fixture.db;
  // doMock + dynamic import: the test database only exists at runtime, so the
  // module under test has to load after these are in place.
  vi.doMock("@/db", () => ({ db, withPgClient: (fn: () => unknown) => fn() }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: db }));
  vi.doMock("@/db/pg/client", () => ({ pgDb: null }));
  ({ ProjectRepository } =
    await import("@/server/features/projects/repositories/ProjectRepository"));
});

/**
 * `getProjectForOrganization` is the check that `ensureUserMiddleware` runs for
 * every server function carrying a projectId. It is the single most
 * load-bearing authorization call in the codebase and had no direct test.
 */
describe("project ownership resolution", () => {
  it("resolves a project to the organization that owns it", async () => {
    const project = await ProjectRepository.getProjectForOrganization(
      PROJECT_A1,
      ORG_A,
    );
    expect(project?.id).toBe(PROJECT_A1);
    expect(project?.organizationId).toBe(ORG_A);
  });

  it("refuses another organization's project id", async () => {
    // This is the URL-tampering case: B's session, A's project id.
    const project = await ProjectRepository.getProjectForOrganization(
      PROJECT_A1,
      ORG_B,
    );
    expect(project ?? null).toBeNull();
  });

  it("refuses in both directions", async () => {
    expect(
      (await ProjectRepository.getProjectForOrganization(PROJECT_B1, ORG_A)) ??
        null,
    ).toBeNull();
  });

  it("refuses an organization that owns no projects at all", async () => {
    expect(
      (await ProjectRepository.getProjectForOrganization(PROJECT_A1, ORG_C)) ??
        null,
    ).toBeNull();
  });

  it("refuses an id that does not exist", async () => {
    expect(
      (await ProjectRepository.getProjectForOrganization(
        "project_invented",
        ORG_A,
      )) ?? null,
    ).toBeNull();
  });

  it("does not confuse two projects owned by the same organization", async () => {
    const second = await ProjectRepository.getProjectForOrganization(
      PROJECT_A2,
      ORG_A,
    );
    expect(second?.id).toBe(PROJECT_A2);
  });

  it("refuses an archived project", async () => {
    // Archiving is a soft delete; a stale id must stop resolving.
    const { projects } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    await db
      .update(projects)
      .set({ archivedAt: new Date().toISOString() })
      .where(eq(projects.id, PROJECT_A2));

    expect(
      (await ProjectRepository.getProjectForOrganization(PROJECT_A2, ORG_A)) ??
        null,
    ).toBeNull();

    await db
      .update(projects)
      .set({ archivedAt: null })
      .where(eq(projects.id, PROJECT_A2));
  });
});

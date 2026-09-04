import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  ORG_A,
  ORG_B,
  PROJECT_A1,
  PROJECT_A2,
  PROJECT_B1,
  USER_CONSULTANT,
  USER_OWNER_A,
  USER_OWNER_B,
  USER_OWNER_C,
  createTenancyFixture,
  type TestDb,
} from "./fixture";
import type * as ProjectRepositoryModule from "@/server/features/projects/repositories/ProjectRepository";

const mockEnv = vi.hoisted(() => ({ DATABASE_PROVIDER: "d1" }));
vi.mock("cloudflare:workers", () => ({ env: mockEnv }));

let db: TestDb;
let ProjectRepository: typeof ProjectRepositoryModule.ProjectRepository;

beforeAll(async () => {
  const fixture = await createTenancyFixture();
  db = fixture.db;
  vi.doMock("@/db", () => ({ db, withPgClient: (fn: () => unknown) => fn() }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: db }));
  vi.doMock("@/db/pg/client", () => ({ pgDb: null }));
  ({ ProjectRepository } =
    await import("@/server/features/projects/repositories/ProjectRepository"));
});

/**
 * Each project owns its own organization, so the switcher lists by membership
 * rather than by the active organization — listing by organization would show
 * whichever single project was already open. USER_CONSULTANT belongs to two
 * organizations and is the agency case: one login, several clients.
 */
describe("the projects a member can switch between", () => {
  it("spans every organization the member belongs to", async () => {
    const projects =
      await ProjectRepository.listProjectsForMember(USER_CONSULTANT);

    expect(projects.map((project) => project.id).toSorted()).toEqual(
      [PROJECT_A1, PROJECT_A2, PROJECT_B1].toSorted(),
    );
  });

  it("shows a single-organization member only their own", async () => {
    const projects =
      await ProjectRepository.listProjectsForMember(USER_OWNER_A);

    expect(projects.map((project) => project.id).toSorted()).toEqual(
      [PROJECT_A1, PROJECT_A2].toSorted(),
    );
    expect(projects.map((project) => project.id)).not.toContain(PROJECT_B1);
  });

  it("shows nothing to a member of an organization with no projects", async () => {
    await expect(
      ProjectRepository.listProjectsForMember(USER_OWNER_C),
    ).resolves.toEqual([]);
  });

  // The switcher navigates by project id, so every row it lists has to carry
  // the organization the session will be moved onto.
  it("carries each project's own organization", async () => {
    const projects =
      await ProjectRepository.listProjectsForMember(USER_CONSULTANT);
    const beta = projects.find((project) => project.id === PROJECT_B1);

    expect(beta?.organizationId).toBe(ORG_B);
    expect(
      projects.find((project) => project.id === PROJECT_A1)?.organizationId,
    ).toBe(ORG_A);
  });
});

/**
 * When a project is not in the active organization, the middleware stops
 * refusing and re-authorizes by membership, then moves the session. That is
 * what makes a switcher click, a bookmark and a shared link all work. It is
 * also the point where an unauthorized project must still be refused, so both
 * directions are pinned here.
 */
describe("authorizing a project outside the active organization", () => {
  it("admits a project the member reaches through another organization", async () => {
    const project = await ProjectRepository.getProjectForMember(
      USER_CONSULTANT,
      PROJECT_B1,
    );

    expect(project?.id).toBe(PROJECT_B1);
    expect(project?.organizationId).toBe(ORG_B);
  });

  it("refuses a project in an organization the member does not belong to", async () => {
    await expect(
      ProjectRepository.getProjectForMember(USER_OWNER_A, PROJECT_B1),
    ).resolves.toBeNull();
  });

  it("refuses in the other direction too", async () => {
    await expect(
      ProjectRepository.getProjectForMember(USER_OWNER_B, PROJECT_A1),
    ).resolves.toBeNull();
  });

  it("refuses a project that does not exist", async () => {
    await expect(
      ProjectRepository.getProjectForMember(USER_CONSULTANT, "project_missing"),
    ).resolves.toBeNull();
  });

  // The organization-scoped check stays the first thing tried, so the
  // membership fallback only ever widens access to the caller's own
  // organizations — never past them.
  it("still refuses a foreign project through the organization check", async () => {
    await expect(
      ProjectRepository.getProjectForOrganization(PROJECT_B1, ORG_A),
    ).resolves.toBeNull();
  });
});

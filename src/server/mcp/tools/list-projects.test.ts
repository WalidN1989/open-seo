import { describe, expect, it, vi } from "vitest";
import { makeToolContext } from "./tool-test-support";
const mocks = vi.hoisted(() => ({ organizations: vi.fn(), projects: vi.fn() }));
vi.mock("@/server/auth/repositories/AuthRepository", () => ({
  AuthRepository: { listOrganizationsForUser: mocks.organizations },
}));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: { listProjects: mocks.projects },
}));
import { listProjectsTool } from "./list-projects";
describe("project workspace discovery", () => {
  it("maps only member workspaces with names and domains", async () => {
    mocks.organizations.mockResolvedValue([
      { id: "org-a", name: "Business A" },
      { id: "org-b", name: "Business B" },
    ]);
    mocks.projects.mockImplementation(async (id: string) => [
      {
        id: `project-${id}`,
        name: "Site",
        domain: "example.com",
        locationCode: 2036,
        languageCode: "en",
      },
    ]);
    const result = await listProjectsTool.handler({}, makeToolContext());
    expect(result.structuredContent?.projects).toMatchObject([
      {
        organizationId: "org-a",
        organizationName: "Business A",
        domain: "example.com",
      },
      {
        organizationId: "org-b",
        organizationName: "Business B",
        domain: "example.com",
      },
    ]);
    expect(mocks.organizations).toHaveBeenCalledWith("user_123");
    expect(mocks.projects).toHaveBeenCalledTimes(2);
  });
  it("returns no projects for an account with no memberships", async () => {
    mocks.organizations.mockResolvedValue([]);
    const result = await listProjectsTool.handler({}, makeToolContext());
    expect(result.structuredContent?.projects).toEqual([]);
    expect(mocks.projects).not.toHaveBeenCalled();
  });
  it("returns readable dashboard addresses while keeping stable tool IDs", async () => {
    mocks.organizations.mockResolvedValue([{ id: "org-a", name: "BooXworm" }]);
    mocks.projects.mockResolvedValue([
      { id: "project-a", slug: "booxworm", name: "BooXworm" },
      { id: "legacy-project", slug: null, name: "Legacy" },
    ]);
    const result = await listProjectsTool.handler({}, makeToolContext());
    expect(result.structuredContent?.projects).toMatchObject([
      {
        id: "project-a",
        slug: "booxworm",
        url: "https://open-seo.test/p/booxworm",
      },
      {
        id: "legacy-project",
        slug: null,
        url: "https://open-seo.test/p/legacy-project",
      },
    ]);
  });
});

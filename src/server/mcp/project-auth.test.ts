import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProjectForMember: vi.fn(),
}));

vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: { getProjectForMember: mocks.getProjectForMember },
}));

const { withMcpProjectAuth } = await import("./project-auth");

function toolContext(organizationId: string) {
  return {
    auth: {
      userId: "user_1",
      userEmail: "user@example.com",
      organizationId,
      scopes: [],
      clientId: "api_key",
      baseUrl: "https://example.com",
    },
  };
}

describe("withMcpProjectAuth", () => {
  beforeEach(() => {
    mocks.getProjectForMember.mockReset();
  });

  it("derives the organization from the project, not from the token", async () => {
    mocks.getProjectForMember.mockResolvedValue({
      id: "project_1",
      organizationId: "org_project",
    });

    const handler = withMcpProjectAuth(async (_args, context) => context);
    // The token defaults to a different workspace than the project lives in.
    const context = toolContext("org_token");
    const result = await handler({ projectId: "project_1" }, context);

    expect(result.auth.organizationId).toBe("org_project");
    expect(result.billing.organizationId).toBe("org_project");
    // Billing and telemetry read the shared context on the way out, so the
    // resolved organization has to be visible there too.
    expect(context.auth.organizationId).toBe("org_project");
  });

  it("refuses a project the caller is not a member of", async () => {
    // The lookup is the gate: a non-member gets null, indistinguishable from
    // the project not existing.
    mocks.getProjectForMember.mockResolvedValue(null);

    const handler = withMcpProjectAuth(async () => "reached");
    await expect(
      handler({ projectId: "project_1" }, toolContext("org_token")),
    ).rejects.toThrow();
    expect(mocks.getProjectForMember).toHaveBeenCalledWith(
      "user_1",
      "project_1",
    );
  });
});

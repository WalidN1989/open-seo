import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  complete: vi.fn(),
  count: vi.fn(),
  memberships: vi.fn(),
  project: vi.fn(),
  reserve: vi.fn(),
}));
vi.mock("cloudflare:workers", () => ({ env: {}, waitUntil: vi.fn() }));
vi.mock("@/server/auth/repositories/AuthRepository", () => ({
  AuthRepository: { listOrganizationIdsForUser: mocks.memberships },
}));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: { getProjectForMember: mocks.project },
}));
vi.mock(
  "@/server/features/business-modules/repositories/BusinessAuditRepository",
  () => ({
    BusinessAuditRepository: {
      completeMcpWrite: mocks.complete,
      countRecentMcpWrites: mocks.count,
      reserveMcpWrite: mocks.reserve,
    },
  }),
);

const {
  requireMcpScope,
  requireMcpToolAccess,
  resolveMcpWriteOrganization,
  reserveMcpWrite,
} = await import("./access-control");
const auth = {
  userId: "user_1",
  userEmail: "a@example.com",
  organizationId: "org_1",
  scopes: [] as string[],
  clientId: "api_key:key_1",
  tokenId: "api_key:key_1",
  legacyBusinessAccess: true,
};

describe("MCP business and voice scopes", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
  });

  for (const scope of [
    "business:read",
    "business:write",
    "voice:read",
    "voice:write",
  ] as const) {
    it(`denies ${scope} when the token lacks it`, () => {
      expect(() => requireMcpScope(auth, scope)).toThrow(/FORBIDDEN|scope/);
    });
    it(`allows ${scope} when explicitly granted`, () => {
      expect(() =>
        requireMcpScope({ ...auth, scopes: [scope] }, scope),
      ).not.toThrow();
    });
  }

  it("preserves legacy Business tools independently of voice grants", () => {
    const policy = {
      scope: "business:read" as const,
      legacyCompatible: true,
      tenantScope: "organization" as const,
    };
    expect(() => requireMcpToolAccess(auth, policy)).not.toThrow();
    expect(() =>
      requireMcpToolAccess({ ...auth, scopes: ["voice:read"] }, policy),
    ).not.toThrow();
    expect(() =>
      requireMcpToolAccess({ ...auth, legacyBusinessAccess: false }, policy),
    ).toThrow(/business:read/);
  });

  it("reserves an audit row before checking the write limit", async () => {
    mocks.reserve.mockResolvedValue({ id: "audit_1" });
    mocks.count.mockResolvedValue(1);
    await reserveMcpWrite({
      auth,
      organizationId: "org_1",
      tool: "create_lead",
      args: { title: "Lead" },
    });
    expect(mocks.reserve).toHaveBeenCalledOnce();
    expect(mocks.count).toHaveBeenCalledOnce();
    expect(mocks.reserve.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.count.mock.invocationCallOrder[0],
    );
  });

  it("resolves project writes only through membership-scoped lookup", async () => {
    mocks.project.mockResolvedValue(null);
    await expect(
      resolveMcpWriteOrganization(
        auth,
        { projectId: "project_other" },
        {
          scope: "voice:write",
          legacyCompatible: false,
          tenantScope: "project",
        },
      ),
    ).rejects.toThrow(/FORBIDDEN/);
    expect(mocks.project).toHaveBeenCalledWith("user_1", "project_other");
  });

  it("rejects the 61st per-token write and finalizes its reservation", async () => {
    mocks.reserve.mockResolvedValue({ id: "audit_61" });
    mocks.count.mockResolvedValue(61);
    mocks.complete.mockResolvedValue({ id: "audit_61" });
    await expect(
      reserveMcpWrite({
        auth,
        organizationId: "org_1",
        tool: "create_lead",
        args: {},
      }),
    ).rejects.toThrow(/rate limit/i);
    expect(mocks.complete).toHaveBeenCalledWith(
      "audit_61",
      expect.objectContaining({ status: "rate_limited" }),
    );
  });
});

import { expect, it, vi } from "vitest";
import { makeToolContext, textContent } from "./tool-test-support";
const mocks = vi.hoisted(() => ({ audit: vi.fn() }));
vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForMember: async () => ({
      id: "project-a",
      organizationId: "org-a",
    }),
  },
}));
vi.mock("@/server/features/audit/repositories/AuditRepository", () => ({
  AuditRepository: {
    getLatestAuditForProject: mocks.audit,
    getIssuesForAudit: async () => [],
  },
}));
vi.mock("@/server/features/audit/services/AuditService", () => ({
  AuditService: {},
}));
import { getAuditIssuesTool } from "./site-audit-tools";
it.each(["completed", "running", "failed"] as const)(
  "describes an empty %s audit without recommending another purchase",
  async (status) => {
    mocks.audit.mockResolvedValue({
      id: "audit-a",
      startUrl: "https://example.invalid",
      status,
    });
    const result = await getAuditIssuesTool.handler(
      { projectId: "project-a" },
      makeToolContext(),
    );
    const text = textContent(result);
    expect(text).not.toContain("re-run");
    expect(text).toContain(
      status === "completed"
        ? "pages outside the crawl were not assessed"
        : `audit is ${status}; this is not a completed clean result`,
    );
  },
);

import { beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { AuditService } from "./AuditService";
const mocks = vi.hoisted(() => ({
  createAudit: vi.fn(),
  getAuditUsageForUser: vi.fn(),
  create: vi.fn(),
  normalize: vi.fn(),
  resolveRedirect: vi.fn(),
}));
vi.mock("cloudflare:workers", () => ({
  env: { SITE_AUDIT_WORKFLOW: { create: mocks.create } },
}));
vi.mock("@/server/features/audit/repositories/AuditRepository", () => ({
  AuditRepository: mocks,
}));
vi.mock("@/server/features/audit/AuditScratchpad", () => ({
  getAuditScratchpad: vi.fn(),
}));
vi.mock("@/server/lib/audit/progress-kv", () => ({ AuditProgressKV: {} }));
vi.mock("@/server/lib/audit/url-policy", () => ({
  normalizeAndValidateStartUrl: mocks.normalize,
  resolveStartUrlRedirects: mocks.resolveRedirect,
}));
const input = {
  actorUserId: "user",
  billingCustomer: {
    userId: "user",
    userEmail: "user@example.com",
    organizationId: "org",
    projectId: "project",
  },
  projectId: "project",
  startUrl: "https://example.com/",
  limitTier: "self_hosted" as const,
};
beforeEach(() => {
  mocks.normalize.mockImplementation(async (url: string) => url);
  mocks.resolveRedirect.mockImplementation(async (url: string) => url);
  mocks.getAuditUsageForUser.mockResolvedValue({
    runningCount: 1,
    capacityUnits: 1,
  });
});
it("rejects an excluded resolved start before saving or starting work", async () => {
  mocks.resolveRedirect.mockResolvedValue("https://example.com/private/start");
  await expect(
    AuditService.startAudit({ ...input, excludePaths: ["/private/"] }),
  ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  expect(mocks.createAudit).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
});
it("persists deduplicated exclusions and passes them to the workflow", async () => {
  await AuditService.startAudit({
    ...input,
    excludePaths: ["/tags/", "/tags/"],
  });
  const persisted = z
    .object({
      projectId: z.string(),
      config: z.object({ excludePaths: z.array(z.string()) }),
    })
    .parse(mocks.createAudit.mock.calls[0][0]);
  const workflow = z
    .object({
      params: z.object({
        projectId: z.string(),
        config: z.object({ excludePaths: z.array(z.string()) }),
      }),
    })
    .parse(mocks.create.mock.calls[0][0]);
  expect(persisted).toEqual({
    projectId: "project",
    config: { excludePaths: ["/tags/"] },
  });
  expect(workflow.params).toEqual(persisted);
});

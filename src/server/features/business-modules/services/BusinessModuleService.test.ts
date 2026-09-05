import { businessModuleCatalog } from "@/shared/business-modules";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/lib/errors";

const repository = vi.hoisted(() => ({
  findMembership: vi.fn(),
  listEntitlements: vi.fn(),
  listMemberPermissions: vi.fn(),
  setEntitlement: vi.fn(),
  setMemberPermission: vi.fn(),
}));
const auditRepository = vi.hoisted(() => ({
  list: vi.fn(),
  record: vi.fn(),
}));

vi.mock("../repositories/BusinessModuleRepository", () => ({
  BusinessModuleRepository: repository,
}));
vi.mock("../repositories/BusinessAuditRepository", () => ({
  BusinessAuditRepository: auditRepository,
}));

import { BusinessModuleService } from "./BusinessModuleService";

describe("BusinessModuleService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.findMembership.mockResolvedValue({
      id: "member-1",
      role: "member",
    });
    repository.listEntitlements.mockResolvedValue([]);
    repository.listMemberPermissions.mockResolvedValue([]);
  });

  it("defaults every paid business module to disabled", async () => {
    const access = await BusinessModuleService.getAccess("org-1", "user-1");
    expect(access).toHaveLength(businessModuleCatalog.length);
    expect(access.every((module) => !module.enabled)).toBe(true);
    expect(access.every((module) => module.permission === null)).toBe(true);
  });

  it("gives an organization owner admin access only to enabled modules", async () => {
    repository.findMembership.mockResolvedValue({
      id: "owner-1",
      role: "owner",
    });
    repository.listEntitlements.mockResolvedValue([
      { moduleKey: "crm", status: "enabled" },
      { moduleKey: "whatsapp", status: "disabled" },
    ]);

    const access = await BusinessModuleService.getAccess("org-1", "user-1");
    expect(access.find((module) => module.key === "crm")).toMatchObject({
      enabled: true,
      permission: "admin",
      canConfigureEntitlement: true,
    });
    expect(access.find((module) => module.key === "whatsapp")).toMatchObject({
      enabled: false,
      permission: null,
    });
  });

  it("requires both the organization entitlement and a staff permission", async () => {
    repository.listEntitlements.mockResolvedValue([
      { moduleKey: "leads", status: "enabled" },
    ]);
    repository.listMemberPermissions.mockResolvedValue([
      { moduleKey: "leads", permission: "view" },
    ]);

    await expect(
      BusinessModuleService.requireAccess("org-1", "user-1", "leads"),
    ).resolves.toMatchObject({ key: "leads", permission: "view" });
    await expect(
      BusinessModuleService.requireAccess("org-1", "user-1", "crm"),
    ).rejects.toEqual(expect.any(AppError));
  });

  it("prevents ordinary staff from changing paid entitlements", async () => {
    await expect(
      BusinessModuleService.setEntitlement("org-1", "user-1", "crm", true),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(repository.setEntitlement).not.toHaveBeenCalled();
  });

  it("records privileged entitlement changes in the tenant audit trail", async () => {
    repository.findMembership.mockResolvedValue({
      id: "owner-1",
      role: "owner",
    });
    await BusinessModuleService.setEntitlement("org-1", "user-1", "crm", true);
    expect(auditRepository.record).toHaveBeenCalledWith({
      organizationId: "org-1",
      actorUserId: "user-1",
      action: "module.enabled",
      targetType: "module",
      targetId: "crm",
    });
  });
});

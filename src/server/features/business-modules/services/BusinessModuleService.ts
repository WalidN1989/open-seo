import { AppError } from "@/server/lib/errors";
import {
  businessModuleCatalog,
  businessModuleKeySchema,
  type BusinessModuleKey,
  type BusinessModulePermission,
} from "@/shared/business-modules";
import { BusinessModuleRepository } from "../repositories/BusinessModuleRepository";
import { BusinessAuditRepository } from "../repositories/BusinessAuditRepository";

const permissionRank: Record<BusinessModulePermission, number> = {
  view: 1,
  manage: 2,
  admin: 3,
};

function isOrganizationAdmin(role: string) {
  return role === "owner" || role === "admin";
}

async function getAccess(organizationId: string, userId: string) {
  const membership = await BusinessModuleRepository.findMembership(
    organizationId,
    userId,
  );
  if (!membership) throw new AppError("FORBIDDEN");

  const [entitlements, permissions] = await Promise.all([
    BusinessModuleRepository.listEntitlements(organizationId),
    BusinessModuleRepository.listMemberPermissions(
      organizationId,
      membership.id,
    ),
  ]);
  const organizationAdmin = isOrganizationAdmin(membership.role);

  return businessModuleCatalog.map((module) => {
    const entitlement = entitlements.find(
      (row) => row.moduleKey === module.key,
    );
    const permission = permissions.find(
      (row) => row.moduleKey === module.key,
    )?.permission;
    const enabled = entitlement?.status === "enabled";
    return {
      ...module,
      enabled,
      permission: organizationAdmin && enabled ? "admin" : (permission ?? null),
      canConfigureEntitlement: organizationAdmin,
    };
  });
}

async function requireAccess(
  organizationId: string,
  userId: string,
  moduleKey: BusinessModuleKey,
  requiredPermission: BusinessModulePermission = "view",
) {
  const access = (await getAccess(organizationId, userId)).find(
    (module) => module.key === moduleKey,
  );
  if (
    !access?.enabled ||
    !access.permission ||
    permissionRank[access.permission] < permissionRank[requiredPermission]
  ) {
    throw new AppError("FORBIDDEN");
  }
  return access;
}

async function setEntitlement(
  organizationId: string,
  userId: string,
  moduleKey: BusinessModuleKey,
  enabled: boolean,
) {
  const membership = await BusinessModuleRepository.findMembership(
    organizationId,
    userId,
  );
  if (!membership || !isOrganizationAdmin(membership.role)) {
    throw new AppError("FORBIDDEN");
  }
  await BusinessModuleRepository.setEntitlement(
    organizationId,
    moduleKey,
    enabled,
  );
  await BusinessAuditRepository.record({
    organizationId,
    actorUserId: userId,
    action: enabled ? "module.enabled" : "module.disabled",
    targetType: "module",
    targetId: moduleKey,
  });
  return { moduleKey, enabled };
}

async function getStaffAccess(organizationId: string, userId: string) {
  const requester = await BusinessModuleRepository.findMembership(
    organizationId,
    userId,
  );
  if (!requester || !isOrganizationAdmin(requester.role)) {
    throw new AppError("FORBIDDEN");
  }

  const [members, entitlements] = await Promise.all([
    BusinessModuleRepository.listMembers(organizationId),
    BusinessModuleRepository.listEntitlements(organizationId),
  ]);
  return Promise.all(
    members.map(async (staffMember) => ({
      ...staffMember,
      permissions: isOrganizationAdmin(staffMember.role)
        ? businessModuleCatalog
            .filter((module) =>
              entitlements.some(
                (row) =>
                  row.moduleKey === module.key && row.status === "enabled",
              ),
            )
            .map((module) => ({
              moduleKey: module.key,
              permission: "admin" as const,
            }))
        : (
            await BusinessModuleRepository.listMemberPermissions(
              organizationId,
              staffMember.id,
            )
          ).flatMap((row) => {
            const moduleKey = businessModuleKeySchema.safeParse(row.moduleKey);
            return moduleKey.success
              ? [{ moduleKey: moduleKey.data, permission: row.permission }]
              : [];
          }),
    })),
  );
}

async function setStaffPermission(
  organizationId: string,
  userId: string,
  memberId: string,
  moduleKey: BusinessModuleKey,
  permission: BusinessModulePermission | null,
) {
  const requester = await BusinessModuleRepository.findMembership(
    organizationId,
    userId,
  );
  if (!requester || !isOrganizationAdmin(requester.role)) {
    throw new AppError("FORBIDDEN");
  }
  const target = await BusinessModuleRepository.findMemberById(
    organizationId,
    memberId,
  );
  if (!target) throw new AppError("NOT_FOUND");
  if (isOrganizationAdmin(target.role)) throw new AppError("CONFLICT");

  if (permission) {
    await BusinessModuleRepository.setMemberPermission(
      organizationId,
      memberId,
      moduleKey,
      permission,
    );
  } else {
    await BusinessModuleRepository.deleteMemberPermission(
      organizationId,
      memberId,
      moduleKey,
    );
  }
  await BusinessAuditRepository.record({
    organizationId,
    actorUserId: userId,
    action: permission
      ? "staff.permission.updated"
      : "staff.permission.removed",
    targetType: "member",
    targetId: memberId,
    metadata: { moduleKey, permission },
  });
  return { memberId, moduleKey, permission };
}

async function getAuditTrail(organizationId: string, userId: string) {
  const requester = await BusinessModuleRepository.findMembership(
    organizationId,
    userId,
  );
  if (!requester || !isOrganizationAdmin(requester.role)) {
    throw new AppError("FORBIDDEN");
  }
  return BusinessAuditRepository.list(organizationId);
}

export const BusinessModuleService = {
  getAccess,
  getAuditTrail,
  getStaffAccess,
  requireAccess,
  setEntitlement,
  setStaffPermission,
};

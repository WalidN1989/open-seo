import { AppError } from "@/server/lib/errors";
import { InvoiceRepository } from "@/server/features/invoicing/repositories/InvoiceRepository";
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

  const [entitlements, permissions, clientLogin] = await Promise.all([
    BusinessModuleRepository.listEntitlements(organizationId),
    BusinessModuleRepository.listMemberPermissions(
      organizationId,
      membership.id,
    ),
    BusinessModuleRepository.isClientLogin(organizationId, userId),
  ]);
  const organizationAdmin =
    isOrganizationAdmin(membership.role) && !clientLogin;
  // Client Reports is the agency's tool, not the client's. A client's
  // workspace has no company details of its own; the agency's does. That is
  // the whole test, and it needs no flag to be set per client.
  const ownsLetterhead = Boolean(
    (await InvoiceRepository.getSettings(organizationId))?.legalName?.trim(),
  );

  return businessModuleCatalog.map((module) => {
    const agencyOnly = module.key === "reports" && !ownsLetterhead;
    const entitlement = entitlements.find(
      (row) => row.moduleKey === module.key,
    );
    const permission = permissions.find(
      (row) => row.moduleKey === module.key,
    )?.permission;
    const enabled = entitlement?.status === "enabled" && !agencyOnly;
    // A client gets whatever the agency switched on, at the level of someone
    // who uses the module rather than configures it. Without this, turning a
    // module on for a client did nothing until somebody also remembered to
    // add them a per-member permission row, which is not what switching a
    // module on is understood to mean.
    const clientPermission = enabled ? ("manage" as const) : null;
    return {
      ...module,
      enabled,
      permission: clientLogin
        ? clientPermission
        : organizationAdmin && enabled
          ? "admin"
          : (permission ?? null),
      // A client never activates their own modules, whatever their role says.
      canConfigureEntitlement: organizationAdmin && !agencyOnly,
      /** Not shown at all here: it belongs to another workspace, or to the
       * agency's side of this one. */
      hidden: agencyOnly || (clientLogin && !enabled),
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

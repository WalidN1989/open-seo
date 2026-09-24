import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  clientLogins,
  member,
  memberModulePermissions,
  organizationModuleEntitlements,
  user,
} from "@/db/schema";
import type {
  BusinessModuleKey,
  BusinessModulePermission,
} from "@/shared/business-modules";

async function listEntitlements(organizationId: string) {
  return db
    .select()
    .from(organizationModuleEntitlements)
    .where(eq(organizationModuleEntitlements.organizationId, organizationId));
}

/**
 * Whether this member is a client of the workspace rather than agency staff.
 * A client's access follows what the agency switched on, not a row somebody
 * remembered to add for them.
 */
async function isClientLogin(organizationId: string, userId: string) {
  const [row] = await db
    .select({ id: clientLogins.id })
    .from(clientLogins)
    .where(
      and(
        eq(clientLogins.organizationId, organizationId),
        eq(clientLogins.userId, userId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

async function findMembership(organizationId: string, userId: string) {
  const [row] = await db
    .select({ id: member.id, role: member.role })
    .from(member)
    .where(
      and(eq(member.organizationId, organizationId), eq(member.userId, userId)),
    )
    .limit(1);
  return row ?? null;
}

async function listMemberPermissions(organizationId: string, memberId: string) {
  return db
    .select()
    .from(memberModulePermissions)
    .where(
      and(
        eq(memberModulePermissions.organizationId, organizationId),
        eq(memberModulePermissions.memberId, memberId),
      ),
    );
}

async function listMembers(organizationId: string) {
  return db
    .select({
      id: member.id,
      userId: member.userId,
      role: member.role,
      name: user.name,
      email: user.email,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, organizationId));
}

/**
 * Who the app acts for when no one is signed in (a webhook, a mailbox): the
 * owner, or an admin in a workspace without one.
 */
async function findOwner(organizationId: string) {
  const members = await listMembers(organizationId);
  return (
    members.find((row) => row.role === "owner") ??
    members.find((row) => row.role === "admin") ??
    null
  );
}

async function findMemberById(organizationId: string, memberId: string) {
  const [row] = await db
    .select({ id: member.id, role: member.role })
    .from(member)
    .where(
      and(eq(member.organizationId, organizationId), eq(member.id, memberId)),
    )
    .limit(1);
  return row ?? null;
}

async function setEntitlement(
  organizationId: string,
  moduleKey: BusinessModuleKey,
  enabled: boolean,
) {
  const now = new Date().toISOString();
  const [row] = await db
    .insert(organizationModuleEntitlements)
    .values({
      id: crypto.randomUUID(),
      organizationId,
      moduleKey,
      status: enabled ? "enabled" : "disabled",
      enabledAt: enabled ? now : null,
      disabledAt: enabled ? null : now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        organizationModuleEntitlements.organizationId,
        organizationModuleEntitlements.moduleKey,
      ],
      set: {
        status: enabled ? "enabled" : "disabled",
        enabledAt: enabled ? now : null,
        disabledAt: enabled ? null : now,
        updatedAt: now,
      },
    })
    .returning();
  return row;
}

async function setMemberPermission(
  organizationId: string,
  memberId: string,
  moduleKey: BusinessModuleKey,
  permission: BusinessModulePermission,
) {
  const now = new Date().toISOString();
  const [row] = await db
    .insert(memberModulePermissions)
    .values({
      id: crypto.randomUUID(),
      organizationId,
      memberId,
      moduleKey,
      permission,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        memberModulePermissions.memberId,
        memberModulePermissions.moduleKey,
      ],
      set: { permission, updatedAt: now },
    })
    .returning();
  return row;
}

async function deleteMemberPermission(
  organizationId: string,
  memberId: string,
  moduleKey: BusinessModuleKey,
) {
  await db
    .delete(memberModulePermissions)
    .where(
      and(
        eq(memberModulePermissions.organizationId, organizationId),
        eq(memberModulePermissions.memberId, memberId),
        eq(memberModulePermissions.moduleKey, moduleKey),
      ),
    );
}

export const BusinessModuleRepository = {
  deleteMemberPermission,
  findMemberById,
  findMembership,
  isClientLogin,
  listEntitlements,
  listMemberPermissions,
  listMembers,
  findOwner,
  setEntitlement,
  setMemberPermission,
};

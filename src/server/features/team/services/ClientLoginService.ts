import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { account, member, organization, user } from "@/db/schema";
import { BusinessAuditRepository } from "@/server/features/business-modules/repositories/BusinessAuditRepository";
import { AppError } from "@/server/lib/errors";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { getAuth } from "@/lib/auth";
import { generateClientPassword } from "../clientPassword";

/**
 * A login for someone outside the agency — a client who should see their own
 * workspace and nothing else.
 *
 * Self-hosted sign-up is closed (an allowlist), so an invitation link alone
 * leaves a client with no way in: there is no account for them to sign into.
 * The workspace's owner creates the account here instead, and hands over the
 * address, the email and a generated password. The password is returned once,
 * never stored in readable form and never written to the audit trail.
 */

const ROLES = ["member", "admin", "owner"] as const;
type TeamRole = (typeof ROLES)[number];

async function requireOwnerOrAdmin(organizationId: string, userId: string) {
  const [row] = await db
    .select({ role: member.role })
    .from(member)
    .where(
      and(eq(member.organizationId, organizationId), eq(member.userId, userId)),
    )
    .limit(1);
  if (!row || !["owner", "admin"].includes(row.role)) {
    throw new AppError(
      "FORBIDDEN",
      "Only an owner or admin of this workspace can create a login.",
    );
  }
}

async function findUserByEmail(email: string) {
  const [row] = await db
    .select({ id: user.id, email: user.email, name: user.name })
    .from(user)
    .where(eq(sql`lower(${user.email})`, email))
    .limit(1);
  return row ?? null;
}

async function addMembership(
  organizationId: string,
  userId: string,
  role: TeamRole,
) {
  const [existing] = await db
    .select({ id: member.id })
    .from(member)
    .where(
      and(eq(member.organizationId, organizationId), eq(member.userId, userId)),
    )
    .limit(1);
  if (existing) return false;
  await db.insert(member).values({
    id: crypto.randomUUID(),
    organizationId,
    userId,
    role,
    createdAt: new Date(),
  });
  return true;
}

async function workspaceName(organizationId: string) {
  const [row] = await db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);
  return row?.name ?? "your workspace";
}

/**
 * Create the account, or add an existing one to this workspace. An account
 * that already exists keeps its password: this never resets someone's login.
 */
async function createLogin(
  organizationId: string,
  actorUserId: string,
  input: { email: string; name?: string | null; role?: TeamRole },
) {
  await requireOwnerOrAdmin(organizationId, actorUserId);
  const email = input.email.trim().toLowerCase();
  const role = input.role ?? "member";
  const existing = await findUserByEmail(email);
  const appUrl = ((await getOptionalEnvValue("BETTER_AUTH_URL")) ?? "").replace(
    /\/+$/,
    "",
  );
  const shared = {
    email,
    signInUrl: `${appUrl}/sign-in`,
    workspace: await workspaceName(organizationId),
  };

  if (existing) {
    const added = await addMembership(organizationId, existing.id, role);
    await BusinessAuditRepository.record({
      organizationId,
      actorUserId,
      action: added ? "team.member.added" : "team.member.already",
      targetType: "user",
      targetId: existing.id,
      metadata: { email, role },
    });
    return {
      ...shared,
      name: existing.name,
      password: null,
      created: false,
      added,
    };
  }

  const password = generateClientPassword();
  const hash = await (await getAuth().$context).password.hash(password);
  const userId = crypto.randomUUID();
  const now = new Date();
  const name = input.name?.trim() || email.split("@")[0] || "Client";
  await db.insert(user).values({
    id: userId,
    name,
    email,
    // Self-hosted sign-in does not verify addresses, and this account was
    // created by the workspace's owner rather than by whoever holds the inbox.
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(account).values({
    id: crypto.randomUUID(),
    accountId: userId,
    providerId: "credential",
    userId,
    password: hash,
    createdAt: now,
    updatedAt: now,
  });
  await addMembership(organizationId, userId, role);
  await BusinessAuditRepository.record({
    organizationId,
    actorUserId,
    action: "team.login.created",
    targetType: "user",
    targetId: userId,
    // The password is handed to the owner once and never recorded.
    metadata: { email, role },
  });
  return { ...shared, name, password, created: true, added: true };
}

export const ClientLoginService = { createLogin };

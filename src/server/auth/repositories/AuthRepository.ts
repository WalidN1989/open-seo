import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { member, organization, user as authUser } from "@/db/schema";

type DelegatedOrganizationInput = {
  id: string;
  name: string;
  slug: string;
};

async function upsertDelegatedOrganization(input: DelegatedOrganizationInput) {
  await db
    .insert(organization)
    .values({
      id: input.id,
      name: input.name,
      slug: input.slug,
      logo: null,
      createdAt: new Date(),
      metadata: null,
    })
    .onConflictDoUpdate({
      target: organization.id,
      set: {
        name: input.name,
        slug: input.slug,
      },
    });
}

async function findFirstOrganizationIdForUser(userId: string) {
  const [existingMembership] = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, userId))
    .orderBy(asc(member.createdAt))
    .limit(1);

  return existingMembership?.organizationId ?? null;
}

async function listOrganizationIdsForUser(userId: string) {
  const rows = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, userId))
    .orderBy(asc(member.createdAt));
  return rows.map((row) => row.organizationId);
}

/** The same memberships, with the names a person actually recognises. */
async function listOrganizationsForUser(userId: string) {
  return db
    .select({ id: organization.id, name: organization.name })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId))
    .orderBy(asc(organization.name));
}

async function getHostedUser(userId: string) {
  return db.query.user.findFirst({
    columns: {
      id: true,
      email: true,
      name: true,
    },
    where: eq(authUser.id, userId),
  });
}

export const AuthRepository = {
  upsertDelegatedOrganization,
  findFirstOrganizationIdForUser,
  listOrganizationIdsForUser,
  listOrganizationsForUser,
  getHostedUser,
} as const;

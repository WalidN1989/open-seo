import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { apikey } from "@/db/schema";

async function getForUser(userId: string, keyId: string) {
  const [row] = await db
    .select({ id: apikey.id, permissions: apikey.permissions })
    .from(apikey)
    .where(and(eq(apikey.id, keyId), eq(apikey.referenceId, userId)))
    .limit(1);
  return row ?? null;
}

async function updatePermissions(
  userId: string,
  keyId: string,
  permissions: Record<string, unknown>,
) {
  const [row] = await db
    .update(apikey)
    .set({
      permissions: JSON.stringify(permissions),
      updatedAt: new Date(),
    })
    .where(and(eq(apikey.id, keyId), eq(apikey.referenceId, userId)))
    .returning({ id: apikey.id });
  return row ?? null;
}

export const ApiKeyRepository = { getForUser, updatePermissions };

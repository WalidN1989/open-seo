import { eq } from "drizzle-orm";
import { db } from "@/db";
import { businessSettings } from "@/db/schema";

/**
 * One settings row per organization, created on first read so every caller
 * can rely on there being one rather than each handling its absence.
 */
async function getOrCreate(organizationId: string) {
  const [existing] = await db
    .select()
    .from(businessSettings)
    .where(eq(businessSettings.organizationId, organizationId))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(businessSettings)
    .values({ id: crypto.randomUUID(), organizationId })
    // Two requests can race to create the first row; the unique index decides
    // and the loser reads what the winner wrote rather than failing.
    .onConflictDoNothing()
    .returning();
  if (created) return created;

  const [raced] = await db
    .select()
    .from(businessSettings)
    .where(eq(businessSettings.organizationId, organizationId))
    .limit(1);
  return raced;
}

async function setCurrency(organizationId: string, currency: string) {
  await getOrCreate(organizationId);
  const [row] = await db
    .update(businessSettings)
    .set({ currency, updatedAt: new Date().toISOString() })
    .where(eq(businessSettings.organizationId, organizationId))
    .returning();
  return row;
}

export const BusinessSettingsRepository = { getOrCreate, setCurrency };

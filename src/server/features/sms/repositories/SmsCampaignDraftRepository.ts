import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { smsCampaignDrafts } from "@/db/schema";
import type { z } from "zod";
import type { createSmsCampaignDraftSchema } from "@/types/schemas/sms-campaigns";

async function list(organizationId: string, connectionId: string) {
  return db
    .select()
    .from(smsCampaignDrafts)
    .where(
      and(
        eq(smsCampaignDrafts.organizationId, organizationId),
        eq(smsCampaignDrafts.connectionId, connectionId),
      ),
    )
    .orderBy(desc(smsCampaignDrafts.createdAt))
    .limit(50);
}

async function create(
  organizationId: string,
  input: z.infer<typeof createSmsCampaignDraftSchema>,
) {
  const [draft] = await db
    .insert(smsCampaignDrafts)
    .values({
      ...input,
      id: crypto.randomUUID(),
      organizationId,
      createdAt: new Date().toISOString(),
    })
    .returning();
  if (!draft) throw new Error("The SMS draft could not be saved.");
  return draft;
}

export const SmsCampaignDraftRepository = { list, create };

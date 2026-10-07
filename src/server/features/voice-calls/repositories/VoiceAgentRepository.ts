import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import { voiceAgentConfigs, voiceAgentVersions } from "@/db/schema";
import { isUniqueViolation } from "@/server/lib/db-errors";

const safeAgentFields = {
  id: voiceAgentConfigs.id,
  name: voiceAgentConfigs.name,
  prompt: voiceAgentConfigs.prompt,
  greeting: voiceAgentConfigs.greeting,
  businessHoursJson: voiceAgentConfigs.businessHoursJson,
  voice: voiceAgentConfigs.voice,
  phoneNumber: voiceAgentConfigs.phoneNumber,
  status: voiceAgentConfigs.status,
  createdAt: voiceAgentConfigs.createdAt,
  updatedAt: voiceAgentConfigs.updatedAt,
};

async function list(organizationId: string) {
  return db
    .select(safeAgentFields)
    .from(voiceAgentConfigs)
    .where(eq(voiceAgentConfigs.organizationId, organizationId))
    .orderBy(desc(voiceAgentConfigs.updatedAt));
}

async function get(organizationId: string, agentId: string) {
  const [row] = await db
    .select(safeAgentFields)
    .from(voiceAgentConfigs)
    .where(
      and(
        eq(voiceAgentConfigs.organizationId, organizationId),
        eq(voiceAgentConfigs.id, agentId),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function updateWithVersion(
  organizationId: string,
  userId: string,
  agentId: string,
  before: Awaited<ReturnType<typeof get>> & object,
  patch: {
    prompt?: string | null;
    greeting?: string | null;
    businessHours?: Record<string, unknown>;
    status?: "draft" | "active" | "paused";
    voice?: string | null;
  },
) {
  let versionedSnapshot = before;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const [{ nextVersion }] = await db
      .select({
        nextVersion: sql<number>`coalesce(max(${voiceAgentVersions.version}), 0) + 1`,
      })
      .from(voiceAgentVersions)
      .where(
        and(
          eq(voiceAgentVersions.organizationId, organizationId),
          eq(voiceAgentVersions.agentConfigId, agentId),
        ),
      );
    try {
      await runBatch((tx) => [
        tx.insert(voiceAgentVersions).values({
          id: crypto.randomUUID(),
          organizationId,
          agentConfigId: agentId,
          version: Number(nextVersion),
          snapshotJson: JSON.stringify(versionedSnapshot),
          createdByUserId: userId,
        }),
        tx
          .update(voiceAgentConfigs)
          .set({
            ...(patch.prompt !== undefined ? { prompt: patch.prompt } : {}),
            ...(patch.greeting !== undefined
              ? { greeting: patch.greeting }
              : {}),
            ...(patch.businessHours !== undefined
              ? { businessHoursJson: JSON.stringify(patch.businessHours) }
              : {}),
            ...(patch.status !== undefined ? { status: patch.status } : {}),
            ...(patch.voice !== undefined ? { voice: patch.voice } : {}),
            updatedAt: new Date().toISOString(),
          })
          .where(
            and(
              eq(voiceAgentConfigs.organizationId, organizationId),
              eq(voiceAgentConfigs.id, agentId),
            ),
          ),
      ]);
      return Number(nextVersion);
    } catch (error) {
      if (!isUniqueViolation(error) || attempt === 2) throw error;
      const current = await get(organizationId, agentId);
      if (!current) throw error;
      versionedSnapshot = current;
    }
  }
  throw new Error("Voice-agent version allocation failed.");
}

export const VoiceAgentRepository = { list, get, updateWithVersion };

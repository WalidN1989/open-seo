import { and, asc, desc, eq, gt, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  voiceAgentConfigs,
  voiceAgentLessons,
  voiceConversationMessages,
  voiceConversations,
} from "@/db/schema";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { z } from "zod";

const MAX_LESSONS = 40;
const MAX_TRANSCRIPT_CHARS = 60_000;
const LEARNING_INTERVAL_MS = 20 * 60 * 60 * 1000;
const lessonKindSchema = z.enum([
  "fact",
  "vocabulary",
  "preference",
  "recurring_question",
  "correction",
]);
const minedLessonsSchema = z.object({
  confirmed: z.array(z.string()).optional(),
  new_lessons: z
    .array(
      z.object({
        kind: lessonKindSchema.optional(),
        lesson: z.string().optional(),
      }),
    )
    .optional(),
  retract: z.array(z.string()).optional(),
});
const anthropicPayloadSchema = z.object({
  content: z
    .array(z.object({ type: z.string(), text: z.string().optional() }))
    .optional(),
  error: z.object({ message: z.string().optional() }).optional(),
});

function credentialPrefix(reference: string) {
  return reference
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_");
}

function parseJson(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start)
    throw new Error("Lesson miner returned invalid JSON.");
  const parsed: unknown = JSON.parse(text.slice(start, end + 1));
  return minedLessonsSchema.parse(parsed);
}

type VoiceAgent = typeof voiceAgentConfigs.$inferSelect;

async function mineAgent(agent: VoiceAgent) {
  const since =
    agent.lastLearnedAt ??
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const conversations = await db
    .select({ id: voiceConversations.id })
    .from(voiceConversations)
    .where(
      and(
        eq(voiceConversations.organizationId, agent.organizationId),
        eq(voiceConversations.agentConfigId, agent.id),
        gt(voiceConversations.startedAt, since),
      ),
    )
    .orderBy(desc(voiceConversations.startedAt))
    .limit(20);
  const now = new Date().toISOString();
  if (!conversations.length) {
    await db
      .update(voiceAgentConfigs)
      .set({ lastLearnedAt: now, updatedAt: now })
      .where(
        and(
          eq(voiceAgentConfigs.id, agent.id),
          eq(voiceAgentConfigs.organizationId, agent.organizationId),
        ),
      );
    return;
  }
  await mineConversations(
    agent,
    conversations.map((row) => row.id),
  );
}

/**
 * Reads the given conversations against what the agent already knows and
 * keeps what is worth remembering: confirming, adding and retracting lessons.
 */
async function mineConversations(agent: VoiceAgent, conversationIds: string[]) {
  const now = new Date().toISOString();
  const messages = await db
    .select({
      conversationId: voiceConversationMessages.conversationId,
      speaker: voiceConversationMessages.speaker,
      transcript: voiceConversationMessages.transcript,
      createdAt: voiceConversationMessages.createdAt,
    })
    .from(voiceConversationMessages)
    .where(
      and(
        eq(voiceConversationMessages.organizationId, agent.organizationId),
        inArray(voiceConversationMessages.conversationId, conversationIds),
      ),
    )
    .orderBy(asc(voiceConversationMessages.createdAt))
    .limit(500);
  if (!messages.length) return;

  const known = await db
    .select()
    .from(voiceAgentLessons)
    .where(
      and(
        eq(voiceAgentLessons.organizationId, agent.organizationId),
        eq(voiceAgentLessons.agentConfigId, agent.id),
      ),
    )
    .orderBy(
      desc(voiceAgentLessons.seenCount),
      desc(voiceAgentLessons.updatedAt),
    )
    .limit(MAX_LESSONS);
  const tenantKey = agent.credentialReference
    ? await getOptionalEnvValue(
        `${credentialPrefix(agent.credentialReference)}_ANTHROPIC_API_KEY`,
      )
    : null;
  const apiKey = tenantKey ?? (await getOptionalEnvValue("ANTHROPIC_API_KEY"));
  if (!apiKey) throw new Error("Anthropic API key is not configured.");
  const transcript = messages
    .map(
      (message) =>
        `${message.speaker === "user" ? "PERSON" : "AGENT"}: ${message.transcript.slice(0, 800)}`,
    )
    .join("\n")
    .slice(0, MAX_TRANSCRIPT_CHARS);
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      model:
        (await getOptionalEnvValue("VOICE_AI_MODEL")) ||
        "claude-haiku-4-5-20251001",
      max_tokens: 2500,
      system: [
        "Mine voice conversations for durable lessons that make the agent better at talking with this person next time. The PERSON may be a customer, a business owner, or agency staff asking the agent to analyse their projects.",
        "Keep only what the PERSON said or made clear: corrections of the agent, how they want answers given (length, tone, what to lead with), names and nicknames (what they call a project, a competitor, themselves), stable facts about their businesses, and questions they keep asking.",
        "Never memorize an agent answer, a number that comes from live data (rankings, counts, traffic, stock, prices), credentials, payment details, or sensitive personal data.",
        "If a PERSON asked the agent to remember something, keep it. Merge duplicates, and retract a known lesson the PERSON has since contradicted.",
        "Each lesson must be one self-contained sentence of at most 300 characters. Return JSON only.",
      ].join("\n"),
      messages: [
        {
          role: "user",
          content: `${known.length ? `Known lessons:\n${known.map((item) => `[${item.id}] (${item.kind}) ${item.lesson}`).join("\n")}` : "No lessons are known yet."}\n\nNew conversations:\n${transcript}\n\nReturn {"confirmed":[],"new_lessons":[{"kind":"fact|vocabulary|preference|recurring_question|correction","lesson":"..."}],"retract":[]}. Confirm known IDs rather than duplicating them.`,
        },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const payload = anthropicPayloadSchema.parse(await response.json());
  if (!response.ok) {
    throw new Error(
      payload.error?.message ?? `Anthropic returned ${response.status}.`,
    );
  }
  const mined = parseJson(
    (payload.content ?? [])
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("\n"),
  );
  const byId = new Map(known.map((item) => [item.id, item]));
  for (const id of mined.confirmed ?? []) {
    const item = byId.get(id);
    if (!item) continue;
    await db
      .update(voiceAgentLessons)
      .set({ seenCount: item.seenCount + 1, updatedAt: now })
      .where(
        and(
          eq(voiceAgentLessons.id, id),
          eq(voiceAgentLessons.organizationId, agent.organizationId),
          eq(voiceAgentLessons.agentConfigId, agent.id),
        ),
      );
  }
  for (const id of mined.retract ?? []) {
    if (!byId.has(id)) continue;
    await db
      .delete(voiceAgentLessons)
      .where(
        and(
          eq(voiceAgentLessons.id, id),
          eq(voiceAgentLessons.organizationId, agent.organizationId),
          eq(voiceAgentLessons.agentConfigId, agent.id),
        ),
      );
  }
  for (const candidate of mined.new_lessons ?? []) {
    const lesson = candidate.lesson?.trim() ?? "";
    if (!lesson || lesson.length > 300) continue;
    await db.insert(voiceAgentLessons).values({
      id: crypto.randomUUID(),
      organizationId: agent.organizationId,
      agentConfigId: agent.id,
      kind: candidate.kind ?? "correction",
      lesson,
    });
  }
  const ranked = await db
    .select({ id: voiceAgentLessons.id })
    .from(voiceAgentLessons)
    .where(
      and(
        eq(voiceAgentLessons.organizationId, agent.organizationId),
        eq(voiceAgentLessons.agentConfigId, agent.id),
      ),
    )
    .orderBy(
      desc(voiceAgentLessons.seenCount),
      desc(voiceAgentLessons.updatedAt),
    );
  const overflow = ranked.slice(MAX_LESSONS).map((item) => item.id);
  if (overflow.length) {
    await db
      .delete(voiceAgentLessons)
      .where(
        and(
          eq(voiceAgentLessons.organizationId, agent.organizationId),
          eq(voiceAgentLessons.agentConfigId, agent.id),
          inArray(voiceAgentLessons.id, overflow),
        ),
      );
  }
  await db
    .update(voiceAgentConfigs)
    .set({ lastLearnedAt: now, updatedAt: now })
    .where(
      and(
        eq(voiceAgentConfigs.id, agent.id),
        eq(voiceAgentConfigs.organizationId, agent.organizationId),
      ),
    );
}

export async function runDueVoiceLearning() {
  // Match the proven support agent's overnight learning window. The slow
  // ticker calls this all day, but mining (and its model spend) happens once
  // in the 03:00 UTC hour when an agent is due.
  if (new Date().getUTCHours() !== 3) return;
  const agents = await db.select().from(voiceAgentConfigs);
  const due = agents.filter(
    (agent) =>
      !agent.lastLearnedAt ||
      Date.now() - new Date(agent.lastLearnedAt).getTime() >=
        LEARNING_INTERVAL_MS,
  );
  for (const agent of due) {
    try {
      await mineAgent(agent);
    } catch (error) {
      console.error(`[voice-learning] Agent ${agent.id} failed:`, error);
    }
  }
}

/**
 * Studies one conversation as soon as it ends, so what was said today shapes
 * the next conversation rather than tomorrow's. The overnight run remains the
 * backstop for conversations nobody ended.
 */
export async function learnFromConversation(
  organizationId: string,
  conversationId: string,
) {
  const [conversation] = await db
    .select({ agentConfigId: voiceConversations.agentConfigId })
    .from(voiceConversations)
    .where(
      and(
        eq(voiceConversations.id, conversationId),
        eq(voiceConversations.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!conversation) return;
  const [agent] = await db
    .select()
    .from(voiceAgentConfigs)
    .where(
      and(
        eq(voiceAgentConfigs.id, conversation.agentConfigId),
        eq(voiceAgentConfigs.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (agent) await mineConversations(agent, [conversationId]);
}

/**
 * Keeps what the person asked to be remembered, word for word, the moment
 * they say it. The next mining pass tidies it into a proper lesson or merges
 * it with one already known.
 */
export async function rememberNow(
  organizationId: string,
  agentConfigId: string,
  transcript: string,
) {
  const lesson = transcript.trim().slice(0, 300);
  if (!lesson) return;
  await db.insert(voiceAgentLessons).values({
    id: crypto.randomUUID(),
    organizationId,
    agentConfigId,
    kind: "preference",
    lesson,
  });
}

/** Everything the workspace's voice agents have learned, most-used first. */
export async function listLessons(organizationId: string) {
  return db
    .select({
      id: voiceAgentLessons.id,
      kind: voiceAgentLessons.kind,
      lesson: voiceAgentLessons.lesson,
      seenCount: voiceAgentLessons.seenCount,
      updatedAt: voiceAgentLessons.updatedAt,
    })
    .from(voiceAgentLessons)
    .where(eq(voiceAgentLessons.organizationId, organizationId))
    .orderBy(
      desc(voiceAgentLessons.seenCount),
      desc(voiceAgentLessons.updatedAt),
    );
}

export async function forgetLesson(organizationId: string, lessonId: string) {
  await db
    .delete(voiceAgentLessons)
    .where(
      and(
        eq(voiceAgentLessons.id, lessonId),
        eq(voiceAgentLessons.organizationId, organizationId),
      ),
    );
}

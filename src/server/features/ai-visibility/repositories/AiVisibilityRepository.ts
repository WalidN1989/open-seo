import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  aiVisibilitySettings as settings,
  aiVisibilityPrompts as prompts,
  aiVisibilityRuns as runs,
  aiVisibilityRunBrands as brands,
  aiVisibilityObservations as observations,
  aiVisibilityCitations as citations,
  aiVisibilityMentions as mentions,
} from "@/db/schema";
import type { InferInsertModel } from "drizzle-orm";
import type { ParsedAiAnswer } from "../providers/dataforseoEvidence";
import { matchAiBrand } from "../services/aiVisibilityMatching";

async function getSettings(projectId: string) {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.projectId, projectId));
  return row ?? null;
}
async function saveSettings(row: InferInsertModel<typeof settings>) {
  await db
    .insert(settings)
    .values(row)
    .onConflictDoUpdate({ target: settings.projectId, set: row });
}
async function listPrompts(projectId: string) {
  return db
    .select()
    .from(prompts)
    .where(and(eq(prompts.projectId, projectId), isNull(prompts.archivedAt)))
    .orderBy(asc(prompts.createdAt), asc(prompts.id));
}
async function addPrompt(projectId: string, text: string) {
  await db.insert(prompts).values({
    id: crypto.randomUUID(),
    projectId,
    text,
    createdAt: new Date().toISOString(),
  });
}
async function archivePrompt(projectId: string, id: string) {
  await db
    .update(prompts)
    .set({ archivedAt: new Date().toISOString() })
    .where(and(eq(prompts.id, id), eq(prompts.projectId, projectId)));
}
async function listRuns(projectId: string) {
  return db
    .select()
    .from(runs)
    .where(eq(runs.projectId, projectId))
    .orderBy(desc(runs.createdAt), desc(runs.id))
    .limit(20);
}
async function getRun(projectId: string, id: string) {
  const [row] = await db
    .select()
    .from(runs)
    .where(and(eq(runs.id, id), eq(runs.projectId, projectId)));
  return row ?? null;
}
async function getActiveRun(projectId: string) {
  const [row] = await db
    .select()
    .from(runs)
    .where(
      and(
        eq(runs.projectId, projectId),
        inArray(runs.status, ["queued", "running"]),
      ),
    );
  return row ?? null;
}
async function createRun(
  run: InferInsertModel<typeof runs>,
  runBrands: InferInsertModel<typeof brands>[],
  answers: InferInsertModel<typeof observations>[],
) {
  await runBatch((tx) => [
    tx.insert(runs).values(run),
    ...runBrands.map((b) => tx.insert(brands).values(b)),
    ...answers.map((a) => tx.insert(observations).values(a)),
  ]);
}
async function getDetails(projectId: string, runId: string) {
  const run = await getRun(projectId, runId);
  if (!run) return null;
  const answers = await db
    .select({ observation: observations, prompt: prompts.text })
    .from(observations)
    .innerJoin(prompts, eq(prompts.id, observations.promptId))
    .where(eq(observations.runId, runId))
    .orderBy(asc(prompts.createdAt), asc(observations.engine));
  const runBrands = await db
    .select()
    .from(brands)
    .where(eq(brands.runId, runId));
  const runCitations = await db
    .select({ citation: citations })
    .from(citations)
    .innerJoin(observations, eq(observations.id, citations.observationId))
    .where(eq(observations.runId, runId))
    .orderBy(asc(citations.position));
  const runMentions = await db
    .select({ mention: mentions })
    .from(mentions)
    .innerJoin(observations, eq(observations.id, mentions.observationId))
    .where(eq(observations.runId, runId));
  return {
    run,
    brands: runBrands,
    answers: answers.map(({ observation, prompt }) => ({
      ...observation,
      prompt,
      citations: runCitations
        .filter((c) => c.citation.observationId === observation.id)
        .map((c) => c.citation),
      mentions: runMentions
        .filter((m) => m.mention.observationId === observation.id)
        .map((m) => m.mention),
    })),
  };
}
async function getCollection(
  projectId: string,
  runId: string,
  observationId: string,
) {
  const run = await getRun(projectId, runId);
  if (!run) return null;
  const [row] = await db
    .select({ observation: observations, prompt: prompts.text })
    .from(observations)
    .innerJoin(prompts, eq(prompts.id, observations.promptId))
    .where(
      and(eq(observations.id, observationId), eq(observations.runId, runId)),
    );
  if (!row) return null;
  const runBrands = await db
    .select()
    .from(brands)
    .where(eq(brands.runId, runId));
  return {
    run,
    observation: { ...row.observation, prompt: row.prompt },
    brands: runBrands,
  };
}

async function startRun(projectId: string, runId: string) {
  await db
    .update(runs)
    .set({ status: "running" })
    .where(
      and(
        eq(runs.projectId, projectId),
        eq(runs.id, runId),
        eq(runs.status, "queued"),
      ),
    );
}
async function claimObservation(id: string) {
  const rows = await db
    .update(observations)
    .set({ status: "collecting" })
    .where(and(eq(observations.id, id), eq(observations.status, "pending")))
    .returning({ id: observations.id });
  return rows.length === 1;
}
async function saveAnswer(
  id: string,
  answer: ParsedAiAnswer,
  runBrands: (typeof brands.$inferSelect)[],
) {
  await runBatch((tx) => [
    ...answer.citations.map((c) =>
      tx
        .insert(citations)
        .values({ ...c, id: crypto.randomUUID(), observationId: id }),
    ),
    ...runBrands.map((b) => {
      const match = matchAiBrand(answer, b);
      return tx.insert(mentions).values({
        id: crypto.randomUUID(),
        observationId: id,
        brandId: b.id,
        mentioned: match.mentioned,
        cited: match.cited,
      });
    }),
    tx
      .update(observations)
      .set({
        status: "completed",
        answer: answer.answerMarkdown,
        collectedAt: answer.collectedAt ?? new Date().toISOString(),
        error: null,
      })
      .where(eq(observations.id, id)),
  ]);
}
async function failObservation(id: string, error: string) {
  await db
    .update(observations)
    .set({ status: "failed", error: error.slice(0, 300) })
    .where(
      and(
        eq(observations.id, id),
        inArray(observations.status, ["pending", "collecting"]),
      ),
    );
}
async function finishRun(projectId: string, runId: string) {
  const run = await getRun(projectId, runId);
  if (!run || !["queued", "running"].includes(run.status)) return;
  await db
    .update(observations)
    .set({
      status: "failed",
      error: "The check was interrupted. It was not retried automatically.",
    })
    .where(
      and(
        eq(observations.runId, runId),
        inArray(observations.status, ["pending", "collecting"]),
      ),
    );
  const rows = await db
    .select({ status: observations.status })
    .from(observations)
    .where(eq(observations.runId, runId));
  const done = rows.filter((r) => r.status === "completed").length;
  await db
    .update(runs)
    .set({
      status:
        done === rows.length && done > 0
          ? "completed"
          : done > 0
            ? "partial"
            : "failed",
      finishedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(runs.id, runId),
        eq(runs.projectId, projectId),
        inArray(runs.status, ["queued", "running"]),
      ),
    );
}
export const AiVisibilityRepository = {
  getSettings,
  saveSettings,
  listPrompts,
  addPrompt,
  archivePrompt,
  listRuns,
  getRun,
  getActiveRun,
  createRun,
  getDetails,
  getCollection,
  startRun,
  claimObservation,
  saveAnswer,
  failObservation,
  finishRun,
};

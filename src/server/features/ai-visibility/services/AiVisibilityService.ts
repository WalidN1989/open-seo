import { env } from "cloudflare:workers";
import { AiVisibilityRepository as repo } from "../repositories/AiVisibilityRepository";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { ProjectContextRepository } from "@/server/features/project-context/repositories/ProjectContextRepository";
import {
  AI_ENGINES,
  AI_LIVE_ANSWER_USD,
  type AiEngine,
} from "@/shared/ai-visibility";
import type { z } from "zod";
import type { aiSettingsInput } from "@/shared/ai-visibility";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { AppError } from "@/server/lib/errors";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { applyBillingMarkupUsd } from "@/shared/billing";

async function reconcileRun(projectId: string) {
  const run = await repo.getActiveRun(projectId);
  if (!run) return;
  try {
    const instance = await env.AI_VISIBILITY_WORKFLOW.get(run.id);
    const status = await instance.status();
    if (["complete", "errored", "terminated"].includes(status.status))
      await repo.finishRun(projectId, run.id);
  } catch {
    // An unavailable status API is not evidence that the workflow stopped.
  }
}

async function state(projectId: string, runId?: string) {
  await reconcileRun(projectId);
  const [project, settings, prompts, runs] = await Promise.all([
    ProjectRepository.getProjectById(projectId),
    repo.getSettings(projectId),
    repo.listPrompts(projectId),
    repo.listRuns(projectId),
  ]);
  if (!project) throw new AppError("NOT_FOUND", "Project not found");
  const selected = runId ?? runs[0]?.id;
  return {
    project,
    settings,
    prompts,
    runs,
    details: selected ? await repo.getDetails(projectId, selected) : null,
  };
}
async function saveSettings(input: z.infer<typeof aiSettingsInput>) {
  await repo.saveSettings({
    projectId: input.projectId,
    brandName: input.brandName,
    domain: input.domain.toLowerCase().replace(/^www\./, ""),
    chatgpt: input.engines.includes("chatgpt"),
    gemini: input.engines.includes("gemini"),
    googleAiOverview: input.engines.includes("google_ai_overview"),
  });
}
async function archivePrompt(projectId: string, promptId: string) {
  await repo.archivePrompt(projectId, promptId);
}

async function addPrompt(projectId: string, text: string) {
  const prompts = await repo.listPrompts(projectId);
  if (prompts.length >= 10)
    throw new AppError(
      "VALIDATION_ERROR",
      "Keep up to 10 active prompts. Archive a prompt to add another.",
    );
  if (prompts.some((p) => p.text.toLowerCase() === text.toLowerCase()))
    throw new AppError("VALIDATION_ERROR", "This prompt is already saved");
  await repo.addPrompt(projectId, text);
}
async function plan(projectId: string) {
  const [project, settings, prompts, competitors] = await Promise.all([
    ProjectRepository.getProjectById(projectId),
    repo.getSettings(projectId),
    repo.listPrompts(projectId),
    ProjectContextRepository.listCompetitors(projectId),
  ]);
  if (!project || !settings)
    throw new AppError("VALIDATION_ERROR", "Save your brand and engines first");
  if (!prompts.length || prompts.length > 10)
    throw new AppError("VALIDATION_ERROR", "Save 1–10 prompts first");
  const engines: AiEngine[] = AI_ENGINES.filter((e) =>
    e === "google_ai_overview" ? settings.googleAiOverview : settings[e],
  );
  if (!engines.length)
    throw new AppError("VALIDATION_ERROR", "Select an engine first");
  const brands = [
    { name: settings.brandName, domain: settings.domain, isOwn: true },
    ...competitors
      .slice(0, 10)
      .filter((c) => c.domain)
      .map((c) => ({
        name: c.name?.trim() || c.domain,
        domain: c.domain.replace(/^www\./, "").toLowerCase(),
        isOwn: false,
      })),
  ].toSorted(
    (a, b) =>
      Number(b.isOwn) - Number(a.isOwn) ||
      a.domain.localeCompare(b.domain) ||
      a.name.localeCompare(b.name),
  );
  const rawCost = Number(
    (prompts.length * engines.length * AI_LIVE_ANSWER_USD).toFixed(5),
  );
  const costUsd = (await isHostedServerAuthMode())
    ? applyBillingMarkupUsd(rawCost)
    : rawCost;
  const snapshot = {
    projectId,
    prompts: prompts.map((p) => ({ id: p.id, text: p.text })),
    engines,
    brands,
    locationCode: project.locationCode,
    languageCode: project.languageCode,
    costUsd,
  };
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(snapshot)),
  );
  const approval = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { ...snapshot, approval, checks: prompts.length * engines.length };
}
async function start(
  projectId: string,
  runId: string,
  approval: string,
  customer: BillingCustomerContext,
) {
  const existing = await repo.getRun(projectId, runId);
  if (existing) return { runId: existing.id };
  const prepared = await plan(projectId);
  if (prepared.approval !== approval)
    throw new AppError(
      "VALIDATION_ERROR",
      "Your prompts, engines or project settings changed. Preview the check again.",
    );
  if (await repo.getActiveRun(projectId))
    throw new AppError(
      "VALIDATION_ERROR",
      "A check is already running. Refresh to see its results.",
    );
  const run = {
    id: runId,
    projectId,
    status: "queued" as const,
    locationCode: prepared.locationCode,
    languageCode: prepared.languageCode,
    estimatedCostUsd: prepared.costUsd,
    createdAt: new Date().toISOString(),
  };
  const brands = prepared.brands.map((b) => ({
    ...b,
    id: crypto.randomUUID(),
    runId,
  }));
  const observations = prepared.prompts.flatMap((p) =>
    prepared.engines.map((engine) => ({
      id: crypto.randomUUID(),
      runId,
      promptId: p.id,
      engine,
      status: "pending" as const,
    })),
  );
  try {
    await repo.createRun(run, brands, observations);
  } catch (error) {
    if (await repo.getRun(projectId, runId)) return { runId };
    if (await repo.getActiveRun(projectId))
      throw new AppError("VALIDATION_ERROR", "A check is already running");
    throw error;
  }
  try {
    await env.AI_VISIBILITY_WORKFLOW.create({
      id: runId,
      params: {
        projectId,
        runId,
        customer: {
          userId: customer.userId,
          userEmail: customer.userEmail,
          organizationId: customer.organizationId,
          projectId,
        },
      },
    });
  } catch {
    // A create timeout may have succeeded. Never start a second paid workflow.
    try {
      const instance = await env.AI_VISIBILITY_WORKFLOW.get(runId);
      await instance.status();
    } catch {
      // Status may be unavailable after creation succeeded. Preserve the lock
      // until a terminal workflow status is confirmed; never replay paid work.
    }
  }
  return { runId };
}
async function collect(
  projectId: string,
  runId: string,
  observationId: string,
  customer: BillingCustomerContext,
) {
  const details = await repo.getCollection(projectId, runId, observationId);
  const observation = details?.observation;
  if (
    !details ||
    !observation ||
    !["queued", "running"].includes(details.run.status)
  )
    return;
  // A resumed execution must never replay an already attempted paid request.
  if (!(await repo.claimObservation(observationId))) return;
  const answer = await createDataforseoClient({
    ...customer,
    projectId,
  }).aiSearch.visibilityLive({
    engine: observation.engine,
    prompt: observation.prompt,
    locationCode: details.run.locationCode,
    languageCode: details.run.languageCode,
    tag: observation.id,
  });
  await repo.saveAnswer(observation.id, answer, details.brands);
}
export const AiVisibilityService = {
  state,
  saveSettings,
  addPrompt,
  archivePrompt,
  plan,
  start,
  collect,
};

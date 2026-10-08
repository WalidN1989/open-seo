import { z } from "zod";

export const AI_ENGINES = ["chatgpt", "gemini", "google_ai_overview"] as const;
export type AiEngine = (typeof AI_ENGINES)[number];
export const AI_ENGINE_LABELS: Record<AiEngine, string> = {
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  google_ai_overview: "Google AI Overview",
};
export interface AiBrand {
  name: string;
  domain: string;
}
// DataForSEO live scraper rate; Google includes depth 10 + async AI overview.
// Checked 2026-10-08: https://dataforseo.com/pricing/ai-optimization/llm-scraper
export const AI_LIVE_ANSWER_USD = 0.004;
export const aiProjectInput = z.object({ projectId: z.string().min(1) });
export const aiSettingsInput = aiProjectInput.extend({
  brandName: z.string().trim().min(2).max(120),
  domain: z
    .string()
    .trim()
    .min(1)
    .max(253)
    .regex(
      /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i,
      "Enter a domain such as example.com",
    ),
  engines: z
    .array(z.enum(AI_ENGINES))
    .min(1)
    .max(3)
    .transform((v) => [...new Set(v)]),
});
export const aiPromptInput = aiProjectInput.extend({
  text: z.string().trim().min(3).max(700),
});
export const aiArchiveInput = aiProjectInput.extend({
  promptId: z.string().uuid(),
});
export const aiRunInput = aiProjectInput.extend({
  runId: z.string().uuid(),
  approval: z.string().length(64),
});
export const aiRunStatus = [
  "queued",
  "running",
  "completed",
  "partial",
  "failed",
] as const;
export const aiObservationStatus = [
  "pending",
  "collecting",
  "completed",
  "failed",
] as const;

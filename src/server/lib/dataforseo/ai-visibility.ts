import { z } from "zod";
import type { AiEngine } from "@/shared/ai-visibility";
import { postAiVisibilityLive } from "./core";
import {
  assertOk,
  buildTaskBilling,
  DataforseoChargedTaskError,
  type DataforseoApiResponse,
} from "./envelope";
import { createDataforseoBillingClassifier } from "@/server/lib/dataforseoBillingClassification";
import {
  parseDataforseoAnswer,
  type ParsedAiAnswer,
} from "@/server/features/ai-visibility/providers/dataforseoEvidence";
import { AppError } from "@/server/lib/errors";
const responseSchema = z.object({
  status_code: z.number(),
  status_message: z.string().optional(),
  tasks: z
    .array(
      z
        .object({
          status_code: z.number(),
          status_message: z.string().optional(),
          path: z.array(z.string()),
          cost: z.number().nonnegative(),
          result: z
            .array(z.unknown())
            .nullish()
            .transform((v) => v ?? undefined),
        })
        .passthrough(),
    )
    .optional(),
});
const classify = createDataforseoBillingClassifier({
  pathPrefix: "/",
  billingIssueCode: "AI_SEARCH_BILLING_ISSUE",
  billingIssueMessage: "Check your connected DataForSEO account balance",
});
export async function fetchAiVisibilityLive(input: {
  engine: AiEngine;
  prompt: string;
  locationCode: number;
  languageCode: string;
  tag: string;
}): Promise<DataforseoApiResponse<ParsedAiAnswer>> {
  const base =
    input.engine === "google_ai_overview"
      ? "/v3/serp/google/organic"
      : `/v3/ai_optimization/${input.engine === "chatgpt" ? "chat_gpt" : "gemini"}/llm_scraper`;
  const path = `${base}/live/advanced`;
  let language = input.languageCode;
  if (input.engine !== "google_ai_overview") {
    if (language === "nb") language = "no";
    if (language === "tl") language = "fil";
    if (language === "pt" && input.engine === "gemini") language = "pt-BR";
  }
  const raw = await postAiVisibilityLive(
    path,
    [
      {
        keyword: input.prompt.replace(/%/g, "%25").replace(/\+/g, "%2B"),
        location_code: input.locationCode,
        language_code: language,
        tag: input.tag,
        ...(input.engine === "google_ai_overview"
          ? { depth: 10, load_async_ai_overview: true }
          : {}),
      },
    ],
    classify,
  );
  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success)
    throw new AppError(
      "INTERNAL_ERROR",
      "Unreadable DataForSEO response; no automatic retry was made",
    );
  const task = assertOk(parsed.data, {
    classify,
    classifyPath: path,
    treatNoResultsAsEmpty: true,
  });
  const billing = buildTaskBilling(task);
  const answer = parseDataforseoAnswer(task.result?.[0] ?? null, input.engine);
  if (!answer)
    throw new DataforseoChargedTaskError("Unreadable AI answer", billing);
  return { data: answer, billing };
}

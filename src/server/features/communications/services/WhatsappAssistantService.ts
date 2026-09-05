import type { z } from "zod";
import { AppError } from "@/server/lib/errors";
import { isUniqueViolation } from "@/server/lib/db-errors";
import { resolveConnectionCredential } from "@/server/lib/connection-secrets";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { BusinessAuditRepository } from "@/server/features/business-modules/repositories/BusinessAuditRepository";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import type {
  createInstantAnswerSchema,
  updateAskedQuestionSchema,
  updateAssistantSettingsSchema,
  updateInstantAnswerSchema,
} from "@/types/schemas/whatsappAssistant";
import { CommunicationsRepository } from "../repositories/CommunicationsRepository";
import {
  WhatsappAssistantRepository as Repo,
  type AssistantSettingsRow,
} from "../repositories/WhatsappAssistantRepository";
import {
  formatMinor,
  normalizeQuestion,
  type PriceToken,
} from "../providers/assistant-knowledge";

export type Connection = NonNullable<
  Awaited<ReturnType<typeof CommunicationsRepository.getWhatsappConnectionById>>
>;

export const DEFAULT_ESCALATION_KEYWORDS =
  "human, agent, manager, real person, speak to someone, call me, complaint, refund, cancel, angry, useless, scam, lawyer, legal, urgent, asap";
export const DEFAULT_HANDOFF_MESSAGE =
  "Thanks — I'm getting a team member to help you with this. Someone will reply here shortly.";

export type AssistantSettings = Omit<
  AssistantSettingsRow,
  "organizationId" | "createdAt" | "updatedAt"
> & { updatedAt: string | null };

/** The settings as the assistant runs them: a missing row means these. */
function withDefaults(row: AssistantSettingsRow | null): AssistantSettings {
  return {
    autopilot: row?.autopilot ?? true,
    model: row?.model ?? null,
    replyDelaySeconds: row?.replyDelaySeconds ?? 3,
    bookingLink: row?.bookingLink ?? null,
    timezone: row?.timezone ?? null,
    businessHoursStart: row?.businessHoursStart ?? null,
    businessHoursEnd: row?.businessHoursEnd ?? null,
    escalationKeywords: row?.escalationKeywords ?? DEFAULT_ESCALATION_KEYWORDS,
    handoffMessage: row?.handoffMessage ?? DEFAULT_HANDOFF_MESSAGE,
    persona: row?.persona ?? null,
    businessFacts: row?.businessFacts ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
}

async function audit(
  organizationId: string,
  userId: string,
  action: string,
  targetId: string,
  metadata?: Record<string, unknown>,
) {
  await BusinessAuditRepository.record({
    organizationId,
    actorUserId: userId,
    action,
    targetType: "whatsapp_assistant",
    targetId,
    metadata,
  });
}

async function priceTokens(organizationId: string): Promise<PriceToken[]> {
  const { products, currency } = await Repo.listPricedProducts(organizationId);
  return products
    .filter((product) => product.salePriceMinor > 0)
    .map((product) => ({
      name: product.name,
      price: formatMinor(product.salePriceMinor, currency),
    }));
}

/**
 * The key the model call uses: the tenant's own stored secret first, then
 * the legacy environment reference, then the platform key (resolved by the
 * provider when it receives null).
 */
async function resolveAiKey(
  aiConnection: NonNullable<
    Awaited<
      ReturnType<typeof CommunicationsRepository.getIntegrationByProvider>
    >
  >,
): Promise<string | null> {
  try {
    return await resolveConnectionCredential(aiConnection, "API_KEY");
  } catch {
    const prefix = aiConnection.credentialReference?.trim();
    return prefix
      ? ((await getOptionalEnvValue(`${prefix}_API_KEY`)) ?? null)
      : null;
  }
}

async function aiStatus(organizationId: string) {
  const aiConnection = await CommunicationsRepository.getIntegrationByProvider(
    organizationId,
    "claude_haiku",
  );
  const connected = aiConnection?.status === "connected";
  let keySource: "integration" | "platform" | "none" = "none";
  if (connected && aiConnection) {
    keySource = (await resolveAiKey(aiConnection))
      ? "integration"
      : (await getOptionalEnvValue("ANTHROPIC_API_KEY"))
        ? "platform"
        : "none";
  }
  return { connected, keySource };
}

async function getConfig(organizationId: string, userId: string) {
  await BusinessModuleService.requireAccess(organizationId, userId, "whatsapp");
  const [row, instantAnswers, askedQuestions, prices, ai] = await Promise.all([
    Repo.getSettings(organizationId),
    Repo.listInstantAnswers(organizationId),
    Repo.listAskedQuestions(organizationId),
    priceTokens(organizationId),
    aiStatus(organizationId),
  ]);
  return {
    settings: withDefaults(row),
    instantAnswers,
    askedQuestions,
    priceTokens: prices,
    ai,
  };
}

async function updateSettings(
  organizationId: string,
  userId: string,
  input: z.infer<typeof updateAssistantSettingsSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "whatsapp",
    "admin",
  );
  const values = Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
  const row = await Repo.upsertSettings(organizationId, values);
  await audit(
    organizationId,
    userId,
    "whatsapp.assistant.settings.updated",
    organizationId,
    {
      fields: Object.keys(values),
    },
  );
  return withDefaults(row);
}

async function createInstantAnswer(
  organizationId: string,
  userId: string,
  input: z.infer<typeof createInstantAnswerSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "whatsapp",
    "admin",
  );
  const row = await Repo.createInstantAnswer(organizationId, {
    question: input.question,
    normalizedQuestion: normalizeQuestion(input.question),
    answer: input.answer,
  }).catch((error: unknown) => {
    if (!isUniqueViolation(error)) throw error;
    throw new AppError(
      "CONFLICT",
      "That question already has an instant answer. Edit the existing one instead.",
    );
  });
  await audit(
    organizationId,
    userId,
    "whatsapp.instant_answer.created",
    row.id,
  );
  return row;
}

async function updateInstantAnswer(
  organizationId: string,
  userId: string,
  input: z.infer<typeof updateInstantAnswerSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "whatsapp",
    "admin",
  );
  const { id, ...rest } = input;
  const row = await Repo.updateInstantAnswer(organizationId, id, {
    ...rest,
    ...(rest.question
      ? { normalizedQuestion: normalizeQuestion(rest.question) }
      : {}),
  });
  if (!row) throw new AppError("NOT_FOUND", "Instant answer not found.");
  await audit(organizationId, userId, "whatsapp.instant_answer.updated", id);
  return row;
}

async function deleteInstantAnswer(
  organizationId: string,
  userId: string,
  id: string,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "whatsapp",
    "admin",
  );
  if (!(await Repo.deleteInstantAnswer(organizationId, id))) {
    throw new AppError("NOT_FOUND", "Instant answer not found.");
  }
  await audit(organizationId, userId, "whatsapp.instant_answer.deleted", id);
  return { deleted: true };
}

async function updateAskedQuestion(
  organizationId: string,
  userId: string,
  input: z.infer<typeof updateAskedQuestionSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "whatsapp",
    "admin",
  );
  const { id, ...rest } = input;
  const values: { blogUrl?: string | null; status?: string } = { ...rest };
  // A saved link means the answer is live unless the operator said otherwise.
  if (rest.blogUrl && rest.status === undefined) values.status = "published";
  const row = await Repo.updateAskedQuestion(organizationId, id, values);
  if (!row) throw new AppError("NOT_FOUND", "Question not found.");
  await audit(organizationId, userId, "whatsapp.asked_question.updated", id);
  return row;
}

async function deleteAskedQuestion(
  organizationId: string,
  userId: string,
  id: string,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "whatsapp",
    "admin",
  );
  if (!(await Repo.deleteAskedQuestion(organizationId, id))) {
    throw new AppError("NOT_FOUND", "Question not found.");
  }
  await audit(organizationId, userId, "whatsapp.asked_question.deleted", id);
  return { deleted: true };
}

export { priceTokens, resolveAiKey };

export const WhatsappAssistantService = {
  getConfig,
  updateSettings,
  createInstantAnswer,
  updateInstantAnswer,
  deleteInstantAnswer,
  updateAskedQuestion,
  deleteAskedQuestion,
  withDefaults,
};

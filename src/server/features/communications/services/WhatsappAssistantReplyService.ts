import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { ProjectContextService } from "@/server/features/project-context/services/ProjectContextService";
import { CommunicationsRepository } from "../repositories/CommunicationsRepository";
import { WhatsappAssistantRepository as Repo } from "../repositories/WhatsappAssistantRepository";
import {
  applyPriceTokens,
  buildBusinessContext,
  formatMinor,
  looksLikeQuestion,
  matchesEscalation,
  normalizeQuestion,
  parseKeywords,
} from "../providers/assistant-knowledge";
import { generateWhatsappAiReply } from "../providers/whatsapp-ai";
import {
  sendWhatsappText,
  type InboundWhatsappMessage,
} from "../providers/whatsapp";
import {
  DEFAULT_HANDOFF_MESSAGE,
  WhatsappAssistantService,
  priceTokens,
  resolveAiKey,
  type AssistantSettings,
  type Connection,
} from "./WhatsappAssistantService";

const { withDefaults } = WhatsappAssistantService;
const PROMPT_PRICE_LIMIT = 120;

/** Everything the model may treat as fact about this business. */
async function businessContext(
  organizationId: string,
  settings: AssistantSettings,
) {
  const [prices, published, projectId] = await Promise.all([
    priceTokens(organizationId),
    Repo.listPublishedAnswers(organizationId),
    Repo.projectIdForOrganization(organizationId),
  ]);
  let projectContext: string | null = null;
  if (projectId) {
    try {
      const context = await ProjectContextService.getProjectContext(projectId);
      projectContext = ProjectContextService.renderProjectContextMarkdown(
        context,
      ).slice(0, 6000);
    } catch {
      projectContext = null;
    }
  }
  return buildBusinessContext({
    settings,
    // A bookshop's whole catalogue does not belong in every prompt; the
    // instant-answer tokens still resolve against the full list.
    prices: prices.slice(0, PROMPT_PRICE_LIMIT),
    publishedAnswers: published.flatMap((item) =>
      item.blogUrl ? [{ question: item.question, url: item.blogUrl }] : [],
    ),
    projectContext,
  });
}

/**
 * What the model sees when it asks about the catalogue: the matching items
 * with their live prices, or a clear "nothing matched" so it does not guess.
 */
async function lookupProducts(organizationId: string, query: string) {
  const [rows, { currency }] = await Promise.all([
    Repo.searchPricedProducts(organizationId, query),
    Repo.listPricedProducts(organizationId).then(({ currency }) => ({
      currency,
    })),
  ]);
  if (!rows.length) {
    return `No catalogue item matches "${query}". Say the team will check whether it can be sourced; do not invent a price.`;
  }
  return rows
    .map(
      (row) =>
        `- ${row.name} — ${formatMinor(row.salePriceMinor, currency)} (SKU ${row.sku})`,
    )
    .join("\n");
}

/** Queue, send, and record one outbound reply on the conversation. */
async function sendReply(
  connection: Connection,
  conversationId: string,
  recipient: string,
  body: string,
) {
  const queued = await CommunicationsRepository.createQueuedWhatsappMessage(
    connection.organizationId,
    conversationId,
    body,
  );
  try {
    const sent = await sendWhatsappText(connection, recipient, body);
    await CommunicationsRepository.completeWhatsappMessage(
      connection.organizationId,
      queued.id,
      {
        externalMessageId: sent.externalMessageId,
        status: sent.status,
        sentAt: new Date().toISOString(),
      },
    );
  } catch (error) {
    await CommunicationsRepository.completeWhatsappMessage(
      connection.organizationId,
      queued.id,
      { status: "failed" },
    );
    throw error;
  }
}

async function applyActions(
  organizationId: string,
  conversationId: string,
  actions: NonNullable<
    Awaited<ReturnType<typeof generateWhatsappAiReply>>
  >["actions"],
) {
  for (const action of actions) {
    if (action.name === "flag_for_team") {
      await CommunicationsRepository.flagWhatsappConversationForTeam(
        organizationId,
        conversationId,
      );
      continue;
    }
    const rawAmount = Number(action.input.amount_cents || 0);
    await CommunicationsRepository.createWhatsappOrder(organizationId, {
      conversationId,
      summary:
        typeof action.input.summary === "string"
          ? action.input.summary.slice(0, 2000)
          : "Customer order enquiry",
      amountCents:
        Number.isSafeInteger(rawAmount) && rawAmount >= 0 ? rawAmount : 0,
    });
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Decide and send the automatic reply to one inbound message. Returns true
 * when the message was handled here — answered, or deliberately left for a
 * person — and false when the deterministic rules should run instead.
 *
 * Order matters: a chat a person has taken over is never touched; an
 * escalation keyword hands off before any answer; an instant answer costs no
 * model call; only then does the model see the conversation.
 */
export async function replyToInbound(
  connection: Connection,
  conversationId: string,
  message: InboundWhatsappMessage,
): Promise<boolean> {
  const organizationId = connection.organizationId;
  const body = message.body?.trim() ?? "";
  const settings = withDefaults(await Repo.getSettings(organizationId));

  if (looksLikeQuestion(body)) {
    await Repo.recordAskedQuestion(organizationId, {
      question: body,
      normalizedQuestion: normalizeQuestion(body),
    }).catch((error: unknown) => {
      console.error("Could not record an asked question", error);
    });
  }

  const status = await Repo.getConversationStatus(
    organizationId,
    conversationId,
  );
  if (status === "pending") return true;

  const keyword = matchesEscalation(
    body,
    parseKeywords(settings.escalationKeywords),
  );
  if (keyword) {
    await CommunicationsRepository.flagWhatsappConversationForTeam(
      organizationId,
      conversationId,
    );
    await sendReply(
      connection,
      conversationId,
      message.sender,
      settings.handoffMessage ?? DEFAULT_HANDOFF_MESSAGE,
    );
    return true;
  }

  if (body) {
    const instant = await Repo.findInstantAnswer(
      organizationId,
      normalizeQuestion(body),
    );
    if (instant) {
      await sendReply(
        connection,
        conversationId,
        message.sender,
        applyPriceTokens(instant.answer, await priceTokens(organizationId)),
      );
      return true;
    }
  }

  if (!settings.autopilot) return false;
  const aiConnection = await CommunicationsRepository.getIntegrationByProvider(
    organizationId,
    "claude_haiku",
  );
  if (aiConnection?.status !== "connected") return false;

  if (settings.replyDelaySeconds > 0) {
    // Let a burst of short messages settle; the last one answers for all.
    await sleep(Math.min(settings.replyDelaySeconds, 8) * 1000);
    const latest = await Repo.latestInboundExternalId(
      organizationId,
      conversationId,
    );
    if (latest && latest !== message.externalMessageId) return true;
  }

  try {
    const [history, context, apiKey] = await Promise.all([
      CommunicationsRepository.getWhatsappConversationHistory(
        organizationId,
        conversationId,
      ),
      businessContext(organizationId, settings),
      resolveAiKey(aiConnection),
    ]);
    const result = await generateWhatsappAiReply({
      history,
      apiKey,
      model: settings.model ?? (await getOptionalEnvValue("WHATSAPP_AI_MODEL")),
      businessContext: context,
      persona: settings.persona,
      lookupProducts: (query) => lookupProducts(organizationId, query),
    });
    if (!result) return false;
    await applyActions(organizationId, conversationId, result.actions);
    if (!result.reply) return false;
    await sendReply(connection, conversationId, message.sender, result.reply);
    return true;
  } catch (error) {
    console.error("WhatsApp assistant failed; using rule fallback", error);
    return false;
  }
}

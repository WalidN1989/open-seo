import { OrderService } from "@/server/features/commerce/services/OrderService";
import { loadWhatsappImage } from "../providers/whatsapp-media";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { ProjectContextService } from "@/server/features/project-context/services/ProjectContextService";
import { CommunicationsRepository } from "../repositories/CommunicationsRepository";
import { WhatsappAssistantRepository as Repo } from "../repositories/WhatsappAssistantRepository";
import {
  applyPriceTokens,
  buildBusinessContext,
  toWhatsappText,
  formatCatalogueMatches,
  looksLikeQuestion,
  matchesEscalation,
  normalizeQuestion,
  parseKeywords,
} from "../providers/assistant-knowledge";
import { generateWhatsappAiReply } from "../providers/whatsapp-ai";
import {
  resolveClientAccess,
  type ClientAccess,
} from "@/server/features/clients/services/ClientVerificationService";
import { readClientData } from "@/server/features/clients/services/ClientDataService";
import { findAccessCodeCandidate } from "@/server/features/clients/codeInMessage";
import {
  CLIENT_DATA_TOPICS,
  CLIENT_DATA_TOPIC_HELP,
  isClientDataTopic,
} from "@/server/features/clients/clientDataTopics";
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
export async function businessContext(
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
export async function lookupProducts(organizationId: string, query: string) {
  const [rows, currency] = await Promise.all([
    Repo.searchPricedProducts(organizationId, query),
    Repo.currencyFor(organizationId),
  ]);
  return formatCatalogueMatches(query, rows, currency);
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
/** What the assistant is told about who it is speaking to. */
function accessNote(access: ClientAccess): string | null {
  if (access.kind === "verified" || access.kind === "just_verified") {
    return `This person has verified as a client: ${access.displayName}.`;
  }
  // Never give an example code. Any string that reads like one is a code
  // somebody holds, and the assistant would be reading it out on request.
  return "This person has NOT verified which client they are. Only if they ask about private SEO client data such as their site, rankings or SEO results, do not discuss specifics — ask them to reply with the access code we sent them, described only as eight characters in two groups of four. Never state, guess at, or give an example of a code. This verification is only for private SEO data, never for retail orders, purchases or delivery enquiries.";
}

/**
 * The client's own data, bound to the account that verified.
 *
 * The organization id is closed over here, from the verification result, and
 * is never a parameter the model can supply. An unverified person gets
 * undefined, which means the tool is not offered at all — not offered and
 * refused, but absent from the toolset.
 */
function clientDataFor(access: ClientAccess) {
  if (access.kind !== "verified" && access.kind !== "just_verified") {
    return undefined;
  }
  const clientOrganizationId = access.clientOrganizationId;
  return {
    topics: CLIENT_DATA_TOPICS,
    help: CLIENT_DATA_TOPIC_HELP,
    read: async (topic: string) => {
      if (!isClientDataTopic(topic)) {
        return "That is not something I can look up.";
      }
      try {
        return await readClientData(clientOrganizationId, topic);
      } catch (error) {
        console.error("Client data lookup failed", error);
        return "That could not be looked up just now.";
      }
    },
  };
}

export async function replyToInbound(
  connection: Connection,
  conversationId: string,
  message: InboundWhatsappMessage,
  options: { scheduled?: boolean } = {},
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

  // Before anything else, including the model: a message carrying a code is
  // handled here and never reaches the assistant.
  //
  // This runs even while a person is assigned. Confirming who someone is is
  // not answering on the team's behalf, and a client who was escalated and
  // then sent their code used to get silence while the code quietly did
  // nothing.
  const access = await resolveClientAccess({
    organizationId,
    identifier: message.sender,
    body,
  }).catch((error: unknown) => {
    console.error("Client access check failed", error);
    return { kind: "anonymous" } as ClientAccess;
  });

  if (access.kind === "locked") {
    await sendReply(
      connection,
      conversationId,
      message.sender,
      "That is too many attempts. For security this number is paused for a few minutes — please try again shortly, or contact us and we will help.",
    );
    return true;
  }
  if (access.kind === "rejected") {
    await sendReply(
      connection,
      conversationId,
      message.sender,
      `That code does not match any account. Please check it and try again — it is eight characters in two groups of four. ${access.remaining} attempt${access.remaining === 1 ? "" : "s"} left.`,
    );
    return true;
  }
  if (access.kind === "just_verified") {
    await sendReply(
      connection,
      conversationId,
      message.sender,
      `Thanks — you are verified as ${access.displayName}. You will not need that code again from this number. What would you like to know?`,
    );
    return true;
  }

  // A person is handling this thread, so the assistant stays out of it.
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
        toWhatsappText(
          applyPriceTokens(instant.answer, await priceTokens(organizationId)),
        ),
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

  if (!options.scheduled && settings.replyDelaySeconds > 0) {
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
    const lastOutbound = history.findLastIndex(
      (item) => item.direction === "outbound",
    );
    const recentImages = history
      .slice(lastOutbound + 1)
      .filter(
        (item) =>
          item.direction === "inbound" &&
          item.messageType === "image" &&
          (item.mediaId || item.mediaUrl),
      )
      .slice(-3);
    let images;
    try {
      images = await Promise.all(
        recentImages.map((item) => loadWhatsappImage(connection, item)),
      );
      if (message.messageType === "image" && images.length === 0) {
        throw new Error("Image reference was unavailable");
      }
    } catch (error) {
      console.error("WhatsApp image could not be read", error);
      const latest = await Repo.latestInboundExternalId(
        organizationId,
        conversationId,
      );
      if (latest && latest !== message.externalMessageId) return true;
      await sendReply(
        connection,
        conversationId,
        message.sender,
        "I received your image, but I can't view it right now. Could you describe what you'd like us to check?",
      );
      return true;
    }
    const result = await generateWhatsappAiReply({
      history: history.map((item) => ({
        ...item,
        body:
          item.direction === "inbound" &&
          findAccessCodeCandidate(item.body ?? "")
            ? "[Access code withheld]"
            : item.messageType === "image" && !item.body
              ? "[Customer sent an image]"
              : item.body,
      })),
      images,
      apiKey,
      model: settings.model ?? (await getOptionalEnvValue("WHATSAPP_AI_MODEL")),
      businessContext: context,
      persona: settings.persona,
      accessNote: accessNote(access),
      lookupProducts: (query) => lookupProducts(organizationId, query),
      lookupOrder: (orderId) =>
        OrderService.lookupCustomerOrder(
          organizationId,
          message.sender,
          orderId,
        ),
      clientData: clientDataFor(access),
    });
    if (!result) return false;
    // Another customer message may arrive while Claude is thinking. The
    // newer scheduled job will answer the entire burst instead.
    const latest = await Repo.latestInboundExternalId(
      organizationId,
      conversationId,
    );
    if (latest && latest !== message.externalMessageId) return true;
    if (
      (await Repo.getConversationStatus(organizationId, conversationId)) ===
      "pending"
    )
      return true;
    await applyActions(organizationId, conversationId, result.actions);
    if (!result.reply) return false;
    await sendReply(
      connection,
      conversationId,
      message.sender,
      toWhatsappText(result.reply),
    );
    return true;
  } catch (error) {
    console.error("WhatsApp assistant failed; using rule fallback", error);
    return false;
  }
}

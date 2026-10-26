import { renderWhatsappResponse } from "@/shared/whatsapp-ai-configuration";
import { WhatsappHandoffService } from "./WhatsappHandoffService";
import { sendAutomaticWhatsappReply } from "./WhatsappAutomaticReplyService";
import { WhatsappReplyControlRepository as Control } from "../repositories/WhatsappReplyControlRepository";
import { OrderService } from "@/server/features/commerce/services/OrderService";
import { loadWhatsappImage } from "../providers/whatsapp-media";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { ProjectContextService } from "@/server/features/project-context/services/ProjectContextService";
import { CommunicationsRepository } from "../repositories/CommunicationsRepository";
import { WhatsappAssistantRepository as Repo } from "../repositories/WhatsappAssistantRepository";
import {
  applyPriceTokens,
  buildBusinessContext,
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
import { redactAccessCode } from "@/server/features/clients/codeInMessage";
import {
  CLIENT_DATA_TOPICS,
  CLIENT_DATA_TOPIC_HELP,
  isClientDataTopic,
} from "@/server/features/clients/clientDataTopics";
import { type InboundWhatsappMessage } from "../providers/whatsapp";
import {
  WhatsappAssistantService,
  priceTokens,
  resolveAiKey,
  type AssistantSettings,
  type Connection,
} from "./WhatsappAssistantService";

import { isPersonalMoneyRequest } from "../providers/whatsapp-reply-policy";

const { withDefaults } = WhatsappAssistantService;
const VERIFICATION_REPLY =
  /^(That code does not match any account\.|That is too many attempts\.|Thanks — you are verified as )/;

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
    prices: prices.slice(0, 120),
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

async function applyActions(
  organizationId: string,
  conversationId: string,
  revision: number,
  actions: NonNullable<
    Awaited<ReturnType<typeof generateWhatsappAiReply>>
  >["actions"],
) {
  for (const action of actions) {
    if (
      !(await Control.isCurrent(organizationId, conversationId, revision, true))
    )
      return;
    if (action.name === "flag_for_team") continue;
    const rawAmount = Number(action.input.amount_cents || 0);
    await Control.createOrder(
      organizationId,
      conversationId,
      revision,
      typeof action.input.summary === "string"
        ? action.input.summary.slice(0, 2000)
        : "Customer order enquiry",
      Number.isSafeInteger(rawAmount) && rawAmount >= 0 ? rawAmount : 0,
    );
  }
}

async function handoffFromActions(
  organizationId: string,
  conversationId: string,
  revision: number,
  actions: NonNullable<
    Awaited<ReturnType<typeof generateWhatsappAiReply>>
  >["actions"],
  body: string,
) {
  const handoff = actions.find((action) => action.name === "flag_for_team");
  if (!handoff) return false;
  const reason =
    typeof handoff.input.reason === "string"
      ? handoff.input.reason.trim().slice(0, 300)
      : "Customer needs assistance";
  const summary =
    typeof handoff.input.summary === "string"
      ? handoff.input.summary.trim().slice(0, 600)
      : body.slice(0, 600);
  await WhatsappHandoffService.start(
    organizationId,
    conversationId,
    revision,
    reason || "Customer needs assistance",
    summary || "Customer needs assistance",
  );
  return true;
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
  if (access.kind === "unavailable") return null;
  if (access.kind === "verified" || access.kind === "just_verified") {
    return `This person has verified as a client: ${access.displayName}.`;
  }
  // Never give an example code. Any string that reads like one is a code
  // somebody holds, and the assistant would be reading it out on request.
  return "This person has NOT verified which client they are. Only if they ask about private SEO client data such as their site, rankings or SEO results, do not discuss specifics — ask them to send /verify followed by their access code, described only as eight characters in two groups of four. Never state, guess at, or give an example of a code. This verification is only for private SEO data, never for retail orders, purchases or delivery enquiries.";
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
  options: { scheduled?: boolean; replyRevision?: number } = {},
): Promise<boolean> {
  const organizationId = connection.organizationId;
  const body = message.body?.trim() ?? "";
  const conversation = await Repo.getConversationReplyState(
    organizationId,
    conversationId,
  );
  if (
    !conversation ||
    conversation.replyMode !== "auto" ||
    (options.replyRevision !== undefined &&
      options.replyRevision !== conversation.replyRevision)
  )
    return true;
  const revision = conversation.replyRevision;
  const current = (allowPending = false) =>
    Control.isCurrent(organizationId, conversationId, revision, allowPending);
  const sendReply = (
    replyBody: string,
    messageType: "text" | "verification" = "text",
  ) =>
    sendAutomaticWhatsappReply(connection, {
      conversationId,
      revision,
      messageId: message.externalMessageId,
      recipient: message.sender,
      body: replyBody,
      messageType,
      allowPending: true,
    });
  if (isPersonalMoneyRequest(body)) {
    await CommunicationsRepository.updateWhatsappConversation(
      organizationId,
      {
        conversationId,
        replyMode: "manual",
      },
      revision,
    );
    return true;
  }
  const settings = withDefaults(await Repo.getSettings(organizationId));

  if (looksLikeQuestion(body)) {
    await Repo.recordAskedQuestion(organizationId, {
      question: body,
      normalizedQuestion: normalizeQuestion(body),
    }).catch((error: unknown) => {
      console.error("Could not record an asked question", error);
    });
  }

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
  }).catch((error: unknown): ClientAccess => {
    console.error("Client access check failed", error);
    return { kind: "unavailable" };
  });

  const verificationReply =
    access.kind === "locked"
      ? settings.responseMessages.verificationLocked
      : access.kind === "rejected"
        ? renderWhatsappResponse(
            settings.responseMessages.verificationRejected,
            { remaining: access.remaining },
          )
        : access.kind === "just_verified"
          ? renderWhatsappResponse(
              settings.responseMessages.verificationSuccess,
              { displayName: access.displayName },
            )
          : null;
  if (verificationReply !== null) {
    await sendReply(verificationReply, "verification");
    return true;
  }

  // A person is handling this thread, so the assistant stays out of it.
  if (conversation.status === "pending") return true;

  const keyword = matchesEscalation(
    body,
    parseKeywords(settings.escalationKeywords),
  );
  if (keyword) {
    await WhatsappHandoffService.start(
      organizationId,
      conversationId,
      revision,
      `Customer requested a person (${keyword})`.slice(0, 300),
      body.slice(0, 600),
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
      await sendReply(settings.responseMessages.imageUnavailable);
      return true;
    }
    if (!(await current())) return true;
    const result = await generateWhatsappAiReply({
      history: history
        .filter(
          (item) =>
            access.kind !== "unavailable" ||
            item.direction !== "outbound" ||
            (item.messageType !== "verification" &&
              !VERIFICATION_REPLY.test(item.body ?? "")),
        )
        .map((item) => ({
          ...item,
          body:
            item.messageType === "image" && !item.body
              ? "[Customer sent an image]"
              : item.direction === "inbound"
                ? redactAccessCode(item.body ?? "")
                : item.body,
        })),
      images,
      apiKey,
      model: settings.model ?? (await getOptionalEnvValue("WHATSAPP_AI_MODEL")),
      businessContext: context,
      persona: settings.persona,
      replyStyle: settings.replyStyle,
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
    if (!(await current())) return true;
    if (!result) return false;
    // Another customer message may arrive while Claude is thinking. The
    // newer scheduled job will answer the entire burst instead.
    const latest = await Repo.latestInboundExternalId(
      organizationId,
      conversationId,
    );
    if (latest && latest !== message.externalMessageId) return true;
    if (result.ignore) {
      await CommunicationsRepository.updateWhatsappConversation(
        organizationId,
        {
          conversationId,
          replyMode: "manual",
        },
        revision,
      );
      return true;
    }
    await applyActions(
      organizationId,
      conversationId,
      revision,
      result.actions,
    );
    if (
      await handoffFromActions(
        organizationId,
        conversationId,
        revision,
        result.actions,
        body,
      )
    )
      return true;
    if (!result.reply) return false;
    await sendReply(result.reply);
    return true;
  } catch (error) {
    console.error("WhatsApp assistant failed; using rule fallback", error);
    return !(await current());
  }
}

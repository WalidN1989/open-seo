import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import type { WhatsappImage } from "./whatsapp-media";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
type HistoryItem = { direction: "inbound" | "outbound"; body: string | null };
type AnthropicBlock =
  | { type: "text"; text: string }
  | {
      type: "tool_use";
      id: string;
      name: string;
      input: Record<string, unknown>;
    };
type AnthropicMessage = {
  role: "user" | "assistant";
  content:
    | string
    | AnthropicBlock[]
    | Array<
        | { type: "text"; text: string }
        | {
            type: "image";
            source: {
              type: "base64";
              media_type: WhatsappImage["mediaType"];
              data: string;
            };
          }
      >
    | Array<{ type: "tool_result"; tool_use_id: string; content: string }>;
};
type AnthropicResponse = {
  content?: AnthropicBlock[];
  error?: { message?: string };
};
type WhatsappAiAction =
  | { name: "create_order_request"; input: Record<string, unknown> }
  | { name: "flag_for_team"; input: Record<string, unknown> };

const tools = [
  {
    name: "ignore_conversation",
    description:
      "Silently stop automatic replies when someone requests personal money, donations, charity, loans or financial assistance unrelated to buying the business products/services. Use the conversation history and understand requests in any language. Never use for business pricing, invoices, refunds, discounts or payment questions. Send no response or other actions.",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "create_order_request",
    description:
      "Record a customer's clear request to buy or enquire about an item. Never claim payment was taken.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        amount_cents: {
          type: "integer",
          description:
            "Use 0 unless a trusted source supplied an exact amount.",
        },
      },
      required: ["summary"],
    },
  },
  {
    name: "flag_for_team",
    description:
      "Flag the chat when a customer requests a person, is upset, or needs unavailable information.",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string" },
        summary: {
          type: "string",
          description:
            "Short customer summary with the order or book involved. No callback or deadline promises.",
        },
      },
      required: ["reason"],
    },
  },
] as const;

/**
 * The tool a verified client's questions are answered from.
 *
 * It takes a topic and nothing else. There is deliberately no field for whose
 * data to read: the caller binds that to the account that verified, so the
 * model cannot ask for someone else's even if a customer talks it into
 * trying.
 */
function clientDataTool(
  topics: readonly string[],
  help: Record<string, string>,
) {
  return {
    name: "lookup_client_data",
    description:
      "Look up this verified client's own SEO data. Call it before answering anything about their site, rankings, keywords, links or content, and answer only from what it returns.",
    input_schema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          enum: [...topics],
          description: topics
            .map((topic) => `${topic}: ${help[topic] ?? ""}`)
            .join("; "),
        },
      },
      required: ["topic"],
    },
  } as const;
}

const lookupTool = {
  name: "lookup_products",
  description:
    "Search the business's own catalogue by title, author, SKU or ISBN and get the live price. Always use this before saying an item is unavailable or quoting a price.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "The item title, author, SKU or ISBN. For a book cover, search its short main title first, without promotional text or the customer's question.",
      },
    },
    required: ["query"],
  },
} as const;

const orderLookupTool = {
  name: "lookup_order",
  description:
    "Look up this WhatsApp sender's own recent orders. Omit order_id to search by the authenticated sending number first. Supply order_id only to narrow a particular order already mentioned. Never accept another phone from the model. Do not ask for SEO access codes for retail orders.",
  input_schema: {
    type: "object",
    properties: { order_id: { type: "string" } },
    required: [],
  },
} as const;

function buildMessages(history: HistoryItem[]) {
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const item of history) {
    if (!item.body?.trim()) continue;
    const role = item.direction === "inbound" ? "user" : "assistant";
    const body = item.body;
    if (!body.trim()) continue;
    const previous = messages.at(-1);
    if (previous?.role === role) previous.content += `\n${body}`;
    else messages.push({ role, content: body });
  }
  while (messages[0]?.role === "assistant") messages.shift();
  return messages;
}

function systemPrompt(input: {
  businessContext?: string | null;
  persona?: string | null;
  replyStyle?: string | null;
  canLookup?: boolean;
  canReadClientData?: boolean;
  accessNote?: string | null;
}) {
  const { businessContext, persona, canLookup, accessNote } = input;
  return [
    persona?.trim() ?? "",
    input.replyStyle?.trim() ?? "",
    canLookup
      ? [
          "When a customer asks about a specific item, title, author or price, call lookup_products first and answer from its result. Only if it returns no match may you say the item is not in the catalogue.",
          "Use only catalogue/tool facts for product prices, availability and links. When the customer agrees to an order request, record it with create_order_request including the title.",
        ].join(" ")
      : "",
    "For retail order facts, use the sender-bound lookup_order callback; never disclose another number's orders or require private SEO verification for retail purchases. Missing tracking is unavailable, never proof that a parcel has not shipped. State only recorded status and its freshness.",
    "If the person asks for personal money, charity, donations, loans or financial support unrelated to this business, call ignore_conversation and send no text. Do not offer charities, helplines, reassurance, access-code requests or follow-up questions. Once the conversation is clearly about personal financial solicitation, do not continue engaging. Business pricing, invoices, refunds, discounts and payment questions are legitimate enquiries and must not be ignored on this basis.",
    "Do not impersonate a human or give a false answer to a direct question about your identity. Use the configured persona and style to word truthful answers.",
    "Never invent prices, stock, availability, delivery terms, opening hours, policies, addresses, or product links. Only state a business fact when it appears in the workspace owner instructions, trusted business context or a tool result. If unavailable, do not state it as known.",
    canLookup
      ? "When a customer sends an image, use it to identify what they are asking about. An image is not proof of current stock or price; use lookup_products for catalogue facts."
      : "When a customer sends an image, use it to understand their question. Do not infer current stock or price from an image; use only confirmed context.",
    "Whenever a person needs to take over, or you would say the team will follow up or confirm something, call flag_for_team with a reason and short customer summary. The server saves the handoff, sends one acknowledgement, and switches the chat to Manual. Do not claim the team was notified, add another handoff message, or promise a callback time or response deadline.",
    "Do not invent a price or commitment on the team's behalf. Only quote confirmed business facts from trusted context or tool results.",
    input.canReadClientData
      ? "This client is verified, so their own SEO data is available to you through lookup_client_data. Use it before saying you cannot see something, and quote its numbers exactly. If it says nothing has been recorded, say that plainly and offer to have the team look, rather than guessing or flagging."
      : "",
    // Established before this call, in code. The model is told the outcome so
    // it can word things well — it is never asked to decide the outcome.
    accessNote?.trim() ?? "",
    businessContext?.trim()
      ? `Trusted business context:\n${businessContext.trim()}`
      : "No trusted business facts have been configured for this tenant yet.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function generateWhatsappAiReply(input: {
  history: HistoryItem[];
  images?: WhatsappImage[];
  apiKey?: string | null;
  model?: string | null;
  businessContext?: string | null;
  /** Who the assistant is and how it talks; replaces the default opener. */
  persona?: string | null;
  /** Workspace-controlled tone, length, language and presentation. */
  replyStyle?: string | null;
  /** What the caller has established about who this person is. */
  accessNote?: string | null;
  /** Catalogue search; when given, the model gets a lookup_products tool. */
  lookupOrder?: (orderId: string) => Promise<string>;
  lookupProducts?: (query: string) => Promise<string>;
  /**
   * A verified client's own data. `read` is already bound to that client, so
   * the model picks a topic and can never pick a whose.
   */
  clientData?: {
    topics: readonly string[];
    help: Record<string, string>;
    read: (topic: string) => Promise<string>;
  };
  fetcher?: typeof fetch;
}) {
  const apiKey =
    input.apiKey ?? (await getOptionalEnvValue("ANTHROPIC_API_KEY"));
  if (!apiKey) return null;
  const messages: AnthropicMessage[] = buildMessages(input.history);
  if (input.images?.length) {
    const last = messages.at(-1);
    if (last?.role === "user") {
      const text = typeof last.content === "string" ? last.content : "";
      last.content = [
        ...input.images.map((image) => ({
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: image.mediaType,
            data: image.data,
          },
        })),
        { type: "text", text: text || "Please help me with this image." },
      ];
    }
  }
  if (!messages.length || messages.at(-1)?.role !== "user") return null;
  const model = input.model || DEFAULT_MODEL;
  const fetcher = input.fetcher ?? fetch;
  const toolset = [
    ...tools,
    ...(input.lookupProducts ? [lookupTool] : []),
    ...(input.lookupOrder ? [orderLookupTool] : []),
    ...(input.clientData
      ? [clientDataTool(input.clientData.topics, input.clientData.help)]
      : []),
  ];
  const system = systemPrompt({
    businessContext: input.businessContext,
    persona: input.persona,
    replyStyle: input.replyStyle,
    canLookup: Boolean(input.lookupProducts),
    canReadClientData: Boolean(input.clientData),
    accessNote: input.accessNote,
  });
  const call = async (conversation: AnthropicMessage[], round: number) => {
    const response = await fetcher(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        model,
        max_tokens: 800,
        system,
        messages: conversation,
        tools: toolset,
        ...(round === 0 && input.images?.length && input.lookupProducts
          ? { tool_choice: { type: "tool", name: "lookup_products" } }
          : {}),
      }),
      signal: AbortSignal.timeout(45_000),
    });
    const payload: AnthropicResponse = await response.json();
    if (!response.ok) {
      throw new Error(
        payload.error?.message || `Anthropic returned ${response.status}`,
      );
    }
    return payload.content ?? [];
  };

  const actions: WhatsappAiAction[] = [];
  let conversation = messages;
  let reply = "";
  // A lookup needs its result before the model can answer, so it always
  // continues. An action tool only continues when the model said nothing
  // else, so the customer never gets silence. Three rounds is plenty.
  for (let round = 0; round < 3; round += 1) {
    const content = await call(conversation, round);
    reply = textOf(content);
    const toolUses = content.filter(
      (block): block is Extract<AnthropicBlock, { type: "tool_use" }> =>
        block.type === "tool_use",
    );
    if (toolUses.some((block) => block.name === "ignore_conversation")) {
      return { reply: "", actions: [], model, ignore: true };
    }
    for (const block of toolUses) {
      if (
        block.name === "create_order_request" ||
        block.name === "flag_for_team"
      ) {
        actions.push({ name: block.name, input: block.input });
      }
    }
    const needsLookup = toolUses.some(
      (block) =>
        block.name === "lookup_products" ||
        block.name === "lookup_client_data" ||
        block.name === "lookup_order",
    );
    if (!toolUses.length || (reply && !needsLookup)) break;
    const results = await Promise.all(
      toolUses.map(async (block) => ({
        type: "tool_result" as const,
        tool_use_id: block.id,
        content: await toolResult(block, input),
      })),
    );
    conversation = [
      ...conversation,
      { role: "assistant", content },
      { role: "user", content: results },
    ];
  }
  return { reply, actions, model, ignore: false };
}

async function toolResult(
  block: Extract<AnthropicBlock, { type: "tool_use" }>,
  input: {
    lookupOrder?: (orderId: string) => Promise<string>;
    lookupProducts?: (query: string) => Promise<string>;
    clientData?: { read: (topic: string) => Promise<string> };
  },
) {
  if (block.name === "lookup_order" && input.lookupOrder) {
    return input.lookupOrder(
      typeof block.input.order_id === "string" ? block.input.order_id : "",
    );
  }
  if (block.name === "lookup_products" && input.lookupProducts) {
    return input.lookupProducts(
      typeof block.input.query === "string" ? block.input.query : "",
    );
  }
  if (block.name === "lookup_client_data" && input.clientData) {
    return input.clientData.read(
      typeof block.input.topic === "string" ? block.input.topic : "",
    );
  }
  return JSON.stringify({ recorded: true });
}

function textOf(content: AnthropicBlock[]) {
  return content
    .filter(
      (block): block is Extract<AnthropicBlock, { type: "text" }> =>
        block.type === "text",
    )
    .map((block) => block.text)
    .join("\n")
    .trim();
}

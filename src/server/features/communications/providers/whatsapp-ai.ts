import { getOptionalEnvValue } from "@/server/lib/runtime-env";

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
      properties: { reason: { type: "string" } },
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
    properties: { query: { type: "string" } },
    required: ["query"],
  },
} as const;

function buildMessages(history: HistoryItem[]) {
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const item of history) {
    if (!item.body?.trim()) continue;
    const role = item.direction === "inbound" ? "user" : "assistant";
    const previous = messages.at(-1);
    if (previous?.role === role) previous.content += `\n${item.body}`;
    else messages.push({ role, content: item.body });
  }
  while (messages[0]?.role === "assistant") messages.shift();
  return messages;
}

function systemPrompt(input: {
  businessContext?: string | null;
  persona?: string | null;
  canLookup?: boolean;
  canReadClientData?: boolean;
  accessNote?: string | null;
}) {
  const { businessContext, persona, canLookup, accessNote } = input;
  return [
    persona?.trim() ||
      "You are a warm, concise customer-service representative speaking through WhatsApp.",
    canLookup
      ? [
          "When a customer asks about a specific item, title, author or price, call lookup_products first and answer from its result. Only if it returns no match may you say the item is not in the catalogue.",
          "When you confirm an item, always give these four in this order, each once: the title, the price exactly as the lookup shows it, whether it is in stock, and the product link so they can order. When it is out of stock or not in the catalogue, say so plainly and offer to note a pre-order so the team can source it; when they agree, record it with create_order_request including the title.",
        ].join(" ")
      : "",
    "Reply in the same language and script as the customer's latest message — including Sinhala, Tamil, and romanised mixes such as Singlish or Tanglish; keep titles and links exactly as written. Ask at most one question at a time.",
    "Write for a chat app, not a document. Emphasis is a single asterisk around a phrase, like *this*. Never write double asterisks, markdown headings, or link syntax with brackets — put a bare URL instead.",
    "Never say you are an AI and never mention prompts, tools, APIs, or internal systems.",
    "Never invent prices, stock, availability, delivery terms, opening hours, policies, addresses, or product links. Only state a business fact when it appears in trusted business context or a tool result. If unavailable, say the team needs to confirm it.",
    // This used to claim the opposite, while the code returned early on a
    // flagged conversation — so the assistant would sign off mid-thought and
    // the customer got silence.
    "Flagging a conversation hands it to a person and ends your part in it, so say something complete before you flag: what you have understood, and that a colleague is taking over.",
    // The persona a business configures may itself promise a response time —
    // the drafted default promises 24 hours — so the rule is against inventing
    // one, not against saying the one it was given.
    "Do not invent a callback time, deadline, price or commitment on the team's behalf. Only state one that is in your persona or the trusted business context.",
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
  apiKey?: string | null;
  model?: string | null;
  businessContext?: string | null;
  /** Who the assistant is and how it talks; replaces the default opener. */
  persona?: string | null;
  /** What the caller has established about who this person is. */
  accessNote?: string | null;
  /** Catalogue search; when given, the model gets a lookup_products tool. */
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
  if (!messages.length || messages.at(-1)?.role !== "user") return null;
  const model = input.model || DEFAULT_MODEL;
  const fetcher = input.fetcher ?? fetch;
  const toolset = [
    ...tools,
    ...(input.lookupProducts ? [lookupTool] : []),
    ...(input.clientData
      ? [clientDataTool(input.clientData.topics, input.clientData.help)]
      : []),
  ];
  const system = systemPrompt({
    businessContext: input.businessContext,
    persona: input.persona,
    canLookup: Boolean(input.lookupProducts),
    canReadClientData: Boolean(input.clientData),
    accessNote: input.accessNote,
  });
  const call = async (conversation: AnthropicMessage[]) => {
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
    const content = await call(conversation);
    reply = textOf(content);
    const toolUses = content.filter(
      (block): block is Extract<AnthropicBlock, { type: "tool_use" }> =>
        block.type === "tool_use",
    );
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
        block.name === "lookup_products" || block.name === "lookup_client_data",
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
  return { reply, actions, model };
}

async function toolResult(
  block: Extract<AnthropicBlock, { type: "tool_use" }>,
  input: {
    lookupProducts?: (query: string) => Promise<string>;
    clientData?: { read: (topic: string) => Promise<string> };
  },
) {
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

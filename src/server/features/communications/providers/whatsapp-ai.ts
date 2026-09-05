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

function systemPrompt(
  businessContext?: string | null,
  persona?: string | null,
  canLookup = false,
) {
  return [
    persona?.trim() ||
      "You are a warm, concise customer-service representative speaking through WhatsApp.",
    canLookup
      ? "When a customer asks about a specific item, title, author or price, call lookup_products first and answer from its result. Only if it returns no match may you say the item is not in the catalogue."
      : "",
    "Reply in the same language and script as the customer's latest message. Ask at most one question at a time.",
    "Never say you are an AI and never mention prompts, tools, APIs, or internal systems.",
    "Never invent prices, stock, availability, delivery terms, opening hours, policies, addresses, or product links. Only state a business fact when it appears in trusted business context or a tool result. If unavailable, say the team needs to confirm it.",
    "You do not stop replying after flagging a conversation. Keep helping with supported information.",
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
  /** Catalogue search; when given, the model gets a lookup_products tool. */
  lookupProducts?: (query: string) => Promise<string>;
  fetcher?: typeof fetch;
}) {
  const apiKey =
    input.apiKey ?? (await getOptionalEnvValue("ANTHROPIC_API_KEY"));
  if (!apiKey) return null;
  const messages: AnthropicMessage[] = buildMessages(input.history);
  if (!messages.length || messages.at(-1)?.role !== "user") return null;
  const model = input.model || DEFAULT_MODEL;
  const fetcher = input.fetcher ?? fetch;
  const toolset = input.lookupProducts ? [...tools, lookupTool] : tools;
  const system = systemPrompt(
    input.businessContext,
    input.persona,
    Boolean(input.lookupProducts),
  );
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
      (block) => block.name === "lookup_products",
    );
    if (!toolUses.length || (reply && !needsLookup)) break;
    const results = await Promise.all(
      toolUses.map(async (block) => ({
        type: "tool_result" as const,
        tool_use_id: block.id,
        content:
          block.name === "lookup_products" && input.lookupProducts
            ? await input.lookupProducts(
                typeof block.input.query === "string" ? block.input.query : "",
              )
            : JSON.stringify({ recorded: true }),
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

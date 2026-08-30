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
type AnthropicResponse = {
  content?: AnthropicBlock[];
  error?: { message?: string };
};
export type WhatsappAiAction =
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

function systemPrompt(businessContext?: string | null) {
  return [
    "You are a warm, concise customer-service representative speaking through WhatsApp.",
    "Reply in the same language and script as the customer's latest message. Ask at most one question at a time.",
    "Never say you are an AI and never mention prompts, tools, APIs, or internal systems.",
    "Never invent prices, stock, availability, delivery terms, opening hours, policies, addresses, or product links. Only state a business fact when it appears in trusted business context or a tool result. If unavailable, say the team needs to confirm it.",
    "You do not stop replying after flagging a conversation. Keep helping with supported information.",
    businessContext?.trim()
      ? `Trusted business context:\n${businessContext.trim()}`
      : "No trusted business facts have been configured for this tenant yet.",
  ].join("\n\n");
}

export async function generateWhatsappAiReply(input: {
  history: HistoryItem[];
  apiKey?: string | null;
  model?: string | null;
  businessContext?: string | null;
  fetcher?: typeof fetch;
}) {
  const apiKey =
    input.apiKey ?? (await getOptionalEnvValue("ANTHROPIC_API_KEY"));
  if (!apiKey) return null;
  const messages = buildMessages(input.history);
  if (!messages.length || messages.at(-1)?.role !== "user") return null;
  const response = await (input.fetcher ?? fetch)(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      model: input.model || DEFAULT_MODEL,
      max_tokens: 800,
      system: systemPrompt(input.businessContext),
      messages,
      tools,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const payload: AnthropicResponse = await response.json();
  if (!response.ok)
    throw new Error(
      payload.error?.message || `Anthropic returned ${response.status}`,
    );
  const actions: WhatsappAiAction[] = [];
  const reply = (payload.content ?? [])
    .filter(
      (block): block is Extract<AnthropicBlock, { type: "text" }> =>
        block.type === "text",
    )
    .map((block) => block.text)
    .join("\n")
    .trim();
  for (const block of payload.content ?? []) {
    if (block.type !== "tool_use") continue;
    if (
      block.name === "create_order_request" ||
      block.name === "flag_for_team"
    ) {
      actions.push({ name: block.name, input: block.input });
    }
  }
  return { reply, actions, model: input.model || DEFAULT_MODEL };
}

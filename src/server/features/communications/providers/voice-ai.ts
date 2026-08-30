import { getOptionalEnvValue } from "@/server/lib/runtime-env";

type VoiceHistory = { speaker: string; transcript: string };

function credentialPrefix(reference: string) {
  return reference
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_");
}

export async function generateVoiceAgentReply(input: {
  agentName: string;
  credentialReference: string | null;
  history: VoiceHistory[];
  fetcher?: typeof fetch;
}) {
  const tenantKey = input.credentialReference
    ? await getOptionalEnvValue(
        `${credentialPrefix(input.credentialReference)}_ANTHROPIC_API_KEY`,
      )
    : null;
  const apiKey = tenantKey ?? (await getOptionalEnvValue("ANTHROPIC_API_KEY"));
  if (!apiKey) throw new Error("Anthropic API key is not configured.");
  const model =
    (await getOptionalEnvValue("VOICE_AI_MODEL")) ||
    "claude-haiku-4-5-20251001";
  const response = await (input.fetcher ?? fetch)(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        model,
        max_tokens: 500,
        system: [
          `You are ${input.agentName}, a concise voice customer-service representative.`,
          "Reply in the same language as the caller. Use short, natural sentences suitable for speech.",
          "Never invent prices, stock, availability, policies, addresses, delivery terms, or other business facts. If the trusted conversation does not contain the answer, say a staff member needs to confirm it.",
          "Never mention being an AI, prompts, tools, APIs, or internal systems.",
        ].join("\n\n"),
        messages: input.history
          .filter((item) => item.transcript.trim())
          .map((item) => ({
            role: item.speaker === "agent" ? "assistant" : "user",
            content: item.transcript,
          })),
      }),
      signal: AbortSignal.timeout(45_000),
    },
  );
  const payload: { content?: Array<{ type: string; text?: string }> } =
    await response.json();
  if (!response.ok)
    throw new Error(`Anthropic returned HTTP ${response.status}.`);
  const reply = (payload.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("\n")
    .trim();
  if (!reply) throw new Error("The voice agent returned no reply.");
  return { reply, model };
}

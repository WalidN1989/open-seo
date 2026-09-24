import { z } from "zod";

/**
 * Sends what was just said and reads the reply back as it is spoken.
 *
 * The events arrive as server-sent lines; each one is handed to the caller
 * the moment it lands, which is what lets the first sentence play while the
 * rest of the answer is still being written.
 */

const eventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heard"), transcript: z.string() }),
  z.object({ type: z.literal("silence") }),
  z.object({
    type: z.literal("speech"),
    index: z.number(),
    mimeType: z.string(),
    audioBase64: z.string(),
  }),
  z.object({
    type: z.literal("done"),
    reply: z.string(),
    endsConversation: z.boolean(),
  }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);

type VoiceTurnEvent = z.infer<typeof eventSchema>;

/** Thrown before anything is spoken, so the caller can fall back. */
export class VoiceTurnUnavailable extends Error {}

export async function* streamVoiceTurn(
  body: {
    conversationId: string;
    audioBase64: string;
    mimeType: string;
    language: string;
  },
  signal?: AbortSignal,
): AsyncGenerator<VoiceTurnEvent> {
  const response = await fetch("/api/voice/turn", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok || !response.body) {
    throw new VoiceTurnUnavailable(
      `The voice turn failed (${response.status}).`,
    );
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });
    // A block split across two reads waits for the rest of itself.
    const blocks = buffered.split("\n\n");
    buffered = blocks.pop() ?? "";
    for (const block of blocks) {
      const data = block.startsWith("data: ") ? block.slice(6) : null;
      if (!data) continue;
      const parsed = eventSchema.safeParse(JSON.parse(data));
      if (parsed.success) yield parsed.data;
    }
  }
}

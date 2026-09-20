import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { CommunicationsRepository } from "@/server/features/communications/repositories/CommunicationsRepository";
import {
  speakWithDeepgram,
  transcribeWithDeepgram,
} from "@/server/features/communications/providers/voice";
import { streamVoiceAgentReply } from "@/server/features/communications/providers/voice-ai";
import { buildVoiceAgentContext } from "@/server/features/communications/services/VoiceAgentContext";
import { rememberNow } from "@/server/features/communications/services/VoiceLearningService";
import { asksToRemember, isFarewell } from "../remember";
import { finalSentence, speakable, takeSentences } from "../sentences";
import { VoiceAnalystService } from "./VoiceAnalystService";

/**
 * One spoken turn, delivered piece by piece.
 *
 * The one-shot path waits for the whole answer to be written and then for all
 * of it to be turned into audio before the person hears anything. Here each
 * finished sentence is spoken as soon as it exists, so the reply starts about
 * as quickly as a person would start talking.
 *
 * The events are: `heard` (what they said), `speech` (a sentence, as audio),
 * and `done` (the full reply, and whether that was goodbye).
 */

export type VoiceTurnEvent =
  | { type: "heard"; transcript: string }
  | { type: "silence" }
  | { type: "speech"; index: number; mimeType: string; audioBase64: string }
  | { type: "done"; reply: string; endsConversation: boolean }
  | { type: "error"; message: string };

async function sessionFor(organizationId: string, conversationId: string) {
  const conversation = await CommunicationsRepository.getVoiceConversation(
    organizationId,
    conversationId,
  );
  if (!conversation || conversation.status !== "active") {
    throw new Error("Active voice conversation not found.");
  }
  const agent = await CommunicationsRepository.getVoiceAgent(
    organizationId,
    conversation.agentConfigId,
  );
  if (!agent) throw new Error("Voice agent not found.");
  return agent;
}

export async function* streamVoiceTurn(input: {
  organizationId: string;
  userId: string;
  conversationId: string;
  audioBase64: string;
  mimeType: string;
  language?: string;
}): AsyncGenerator<VoiceTurnEvent> {
  await BusinessModuleService.requireAccess(
    input.organizationId,
    input.userId,
    "voice",
    "manage",
  );
  const agent = await sessionFor(input.organizationId, input.conversationId);
  if (
    agent.speechToTextProvider !== "deepgram" ||
    agent.textToSpeechProvider !== "deepgram" ||
    agent.modelProvider !== "anthropic"
  ) {
    throw new Error("This voice agent is not set up for streaming replies.");
  }

  const startedAt = Date.now();
  const heard = await transcribeWithDeepgram(
    agent.credentialReference,
    input.audioBase64,
    input.mimeType,
    input.language,
  );
  const heardAt = Date.now();
  // Nothing was said: no turn is saved and the microphone stays open.
  if (!heard.transcript) {
    yield { type: "silence" };
    return;
  }
  yield { type: "heard", transcript: heard.transcript };

  await CommunicationsRepository.appendVoiceTranscript(input.organizationId, {
    conversationId: input.conversationId,
    speaker: "user",
    transcript: heard.transcript,
  });
  if (asksToRemember(heard.transcript)) {
    await rememberNow(input.organizationId, agent.id, heard.transcript).catch(
      (error: unknown) =>
        console.error("[voice-learning] remember failed:", error),
    );
  }

  // The history carries which project this conversation is about, so it is
  // read first; the two contexts are then read together.
  const history = await CommunicationsRepository.getVoiceConversationMessages(
    input.organizationId,
    input.conversationId,
  );
  const [businessContext, analystContext] = await Promise.all([
    buildVoiceAgentContext(input.organizationId, agent.id, heard.transcript),
    VoiceAnalystService.contextForTurn(
      input.organizationId,
      input.userId,
      history
        .filter((turn) => turn.speaker === "user")
        .map((turn) => turn.transcript),
    ),
  ]);
  const readyAt = Date.now();

  let spoken = 0;
  let firstAudioAt = 0;
  const said: string[] = [];
  async function* speak(piece: string): AsyncGenerator<VoiceTurnEvent> {
    const words = speakable(piece);
    if (!words) return;
    const audio = await speakWithDeepgram(agent.credentialReference, words);
    if (!firstAudioAt) firstAudioAt = Date.now();
    yield {
      type: "speech",
      index: spoken,
      mimeType: audio.mimeType,
      audioBase64: audio.audioBase64,
    };
    spoken += 1;
  }

  let buffer = "";
  for await (const delta of streamVoiceAgentReply({
    agentName: agent.name,
    credentialReference: agent.credentialReference,
    history,
    businessContext,
    analystContext,
  })) {
    buffer += delta;
    const { sentences, rest } = takeSentences(buffer);
    buffer = rest;
    for (const sentence of sentences) {
      said.push(sentence);
      yield* speak(sentence);
    }
  }
  const last = finalSentence(buffer);
  if (last) {
    said.push(last);
    yield* speak(last);
  }

  const reply = said.join(" ").trim();
  if (!reply) throw new Error("The voice agent returned no reply.");
  await CommunicationsRepository.appendVoiceTranscript(input.organizationId, {
    conversationId: input.conversationId,
    speaker: "agent",
    transcript: reply,
  });
  console.info(
    `[voice] streamed turn: heard ${heardAt - startedAt}ms, context ${readyAt - heardAt}ms, first words ${firstAudioAt - readyAt}ms, whole reply ${Date.now() - readyAt}ms`,
  );
  yield {
    type: "done",
    reply,
    endsConversation: isFarewell(heard.transcript),
  };
}

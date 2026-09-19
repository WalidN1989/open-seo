type VoiceActivityConfig = {
  speechThreshold: number;
  silenceMs: number;
  patienceMs: number;
  maxMs: number;
  minSpeechMs: number;
};

export const VOICE_ACTIVITY_DEFAULTS: VoiceActivityConfig = {
  speechThreshold: 0.018,
  // How long a pause ends a turn. Shorter feels like a conversation; much
  // shorter cuts people off mid-thought.
  silenceMs: 900,
  patienceMs: 60_000,
  maxMs: 300_000,
  minSpeechMs: 250,
};

type VoiceActivityState = {
  startedAt: number;
  lastSpeechAt: number | null;
  speechMs: number;
  lastAt: number;
};

export function startVoiceActivity(now: number): VoiceActivityState {
  return { startedAt: now, lastSpeechAt: null, speechMs: 0, lastAt: now };
}

export function stepVoiceActivity(
  state: VoiceActivityState,
  level: number,
  now: number,
  config = VOICE_ACTIVITY_DEFAULTS,
): { state: VoiceActivityState; action: "continue" | "submit" | "discard" } {
  const isSpeech = level >= config.speechThreshold;
  const next = {
    ...state,
    lastAt: now,
    lastSpeechAt: isSpeech ? now : state.lastSpeechAt,
    speechMs: state.speechMs + (isSpeech ? Math.max(0, now - state.lastAt) : 0),
  };
  const elapsed = now - state.startedAt;
  if (elapsed >= config.maxMs) {
    return {
      state: next,
      action: next.speechMs >= config.minSpeechMs ? "submit" : "discard",
    };
  }
  if (next.lastSpeechAt === null) {
    return {
      state: next,
      action: elapsed >= config.patienceMs ? "discard" : "continue",
    };
  }
  if (isSpeech || now - next.lastSpeechAt < config.silenceMs) {
    return { state: next, action: "continue" };
  }
  if (next.speechMs >= config.minSpeechMs) {
    return { state: next, action: "submit" };
  }
  return {
    state: { ...next, lastSpeechAt: null, speechMs: 0, startedAt: now },
    action: "continue",
  };
}

export function voiceDisplayLevel(level: number) {
  return Math.min(1, Math.cbrt(Math.min(level, 0.3) / 0.3));
}

/**
 * Hearing the person start to talk while the agent is speaking. Louder than
 * ordinary speech detection and it must last, because the agent's own voice
 * leaks back into the microphone and a cough is not an interruption.
 */
const BARGE_IN = { threshold: 0.05, sustainMs: 220 } as const;

type BargeInState = { speechMs: number; lastAt: number };

export function startBargeIn(now: number): BargeInState {
  return { speechMs: 0, lastAt: now };
}

export function stepBargeIn(
  state: BargeInState,
  level: number,
  now: number,
): { state: BargeInState; interrupted: boolean } {
  const speechMs =
    level >= BARGE_IN.threshold
      ? state.speechMs + Math.max(0, now - state.lastAt)
      : 0;
  return {
    state: { speechMs, lastAt: now },
    interrupted: speechMs >= BARGE_IN.sustainMs,
  };
}

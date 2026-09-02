import { describe, expect, it } from "vitest";
import {
  startVoiceActivity,
  stepVoiceActivity,
  VOICE_ACTIVITY_DEFAULTS,
} from "./voiceActivity";

describe("voice activity", () => {
  it("submits speech after a natural pause", () => {
    let state = startVoiceActivity(0);
    state = stepVoiceActivity(state, 0.04, 300).state;
    state = stepVoiceActivity(state, 0.04, 700).state;
    expect(stepVoiceActivity(state, 0, 2_101).action).toBe("submit");
  });

  it("discards a silent room instead of sending empty audio", () => {
    const state = startVoiceActivity(0);
    expect(
      stepVoiceActivity(state, 0, VOICE_ACTIVITY_DEFAULTS.patienceMs).action,
    ).toBe("discard");
  });

  it("ignores a short noise", () => {
    let state = startVoiceActivity(0);
    state = stepVoiceActivity(state, 0.04, 100).state;
    const result = stepVoiceActivity(state, 0, 1_501);
    expect(result.action).toBe("continue");
    expect(result.state.lastSpeechAt).toBeNull();
  });
});

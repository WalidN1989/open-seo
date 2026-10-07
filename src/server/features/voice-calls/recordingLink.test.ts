import { describe, expect, it } from "vitest";
import {
  signVoiceRecordingToken,
  verifyVoiceRecordingToken,
} from "./recordingLink";

describe("voice recording links", () => {
  it("binds a short-lived link to both call and workspace", async () => {
    const claims = {
      callId: "call_1",
      organizationId: "org_1",
      expiresAt: 2000,
    };
    const token = await signVoiceRecordingToken(claims, "secret");
    await expect(
      verifyVoiceRecordingToken(token, "secret", 1000),
    ).resolves.toEqual(claims);
    await expect(
      verifyVoiceRecordingToken(token, "secret", 2001),
    ).resolves.toBeNull();
  });
});

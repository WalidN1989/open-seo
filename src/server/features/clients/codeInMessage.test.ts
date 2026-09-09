import { describe, expect, it } from "vitest";
import {
  findAccessCodeCandidate,
  looksLikeAccountEnquiry,
} from "./codeInMessage";

describe("spotting a code someone sent", () => {
  it("reads a code sent on its own, however they space it", () => {
    for (const text of ["W4KD3TXR", "  w4kd3txr ", "W4KD-3TXR", "W4KD 3TXR"]) {
      expect(findAccessCodeCandidate(text)?.code).toBe("W4KD3TXR");
    }
  });

  it("reads a code inside a sentence when it is written in halves", () => {
    expect(findAccessCodeCandidate("my code is W4KD-3TXR")?.code).toBe(
      "W4KD3TXR",
    );
    expect(findAccessCodeCandidate("W4KD-3TXR thanks")?.code).toBe("W4KD3TXR");
    expect(findAccessCodeCandidate("Here you go: w4kd–3txr")?.code).toBe(
      "W4KD3TXR",
    );
  });

  it("treats four-and-four as deliberate and a bare word as a guess", () => {
    // "FEEDBACK" is eight spellable characters — a whole valid code. It is
    // still tried, because a right guess should verify them, but only the
    // deliberate form may be refused out loud or counted towards a lockout.
    expect(findAccessCodeCandidate("W4KD-3TXR")?.deliberate).toBe(true);
    expect(findAccessCodeCandidate("FEEDBACK")?.deliberate).toBe(false);
  });

  it("ignores an ordinary word sitting inside a sentence", () => {
    // BACKREST is eight spellable characters. Reading it out of prose would
    // burn an attempt and could lock out the person trying to talk to us.
    expect(
      findAccessCodeCandidate("the backrest on my chair broke yesterday"),
    ).toBeNull();
    expect(findAccessCodeCandidate("STANDARD pricing please")).toBeNull();
  });

  it("ignores prose with no code in it", () => {
    for (const text of [
      "hi there",
      "I'm a registered client. I would like to know something about my business",
      "",
      "   ",
      "1234",
    ]) {
      expect(findAccessCodeCandidate(text)).toBeNull();
    }
  });

  it("ignores a code-shaped run that uses excluded characters", () => {
    // I, O, L and U never appear in a real code, so these cannot be one.
    expect(findAccessCodeCandidate("HELLOYOU")).toBeNull();
    expect(findAccessCodeCandidate("MAIL-BOX1")).toBeNull();
  });
});

describe("spotting an account enquiry", () => {
  it("recognises the ways a client raises their own account", () => {
    for (const text of [
      "I want to know about my business",
      "how is our website doing",
      "can you check my rankings",
      "I'm a registered client",
      "question about my project",
      "how is my seo going",
    ]) {
      expect(looksLikeAccountEnquiry(text)).toBe(true);
    }
  });

  it("does not fire on a general question", () => {
    for (const text of [
      "hi there",
      "what are your prices",
      "do you build websites",
      "what time do you open",
    ]) {
      expect(looksLikeAccountEnquiry(text)).toBe(false);
    }
  });
});

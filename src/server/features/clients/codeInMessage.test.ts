import { describe, expect, it } from "vitest";
import {
  findAccessCodeCandidate,
  looksLikeAccountEnquiry,
} from "./codeInMessage";

describe("spotting a code someone sent", () => {
  it("reads a code sent on its own, however they space it", () => {
    for (const text of ["W4KD3TXR", "  w4kd3txr ", "W4KD-3TXR", "W4KD 3TXR"]) {
      expect(findAccessCodeCandidate(text)).toBe("W4KD3TXR");
    }
  });

  it("reads a code inside a sentence when it is written in halves", () => {
    expect(findAccessCodeCandidate("my code is W4KD-3TXR")).toBe("W4KD3TXR");
    expect(findAccessCodeCandidate("W4KD-3TXR thanks")).toBe("W4KD3TXR");
    expect(findAccessCodeCandidate("Here you go: w4kd–3txr")).toBe("W4KD3TXR");
  });

  it("ignores an ordinary word that happens to fit the alphabet", () => {
    // BACKREST is eight spellable characters. Treating it as a code would
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

import { describe, expect, it } from "vitest";
import {
  findAccessCodeCandidate,
  looksLikeAccountEnquiry,
  redactAccessCode,
} from "./codeInMessage";

describe("deliberate client verification", () => {
  it.each([
    "/verify W4KD3TXR",
    "/verify w4kd-3txr",
    " /verify W4KD 3TXR ",
    "/VERIFY W4KD—3TXR.",
  ])("reads an explicit submission: %s", (text) => {
    expect(findAccessCodeCandidate(text)).toEqual({ code: "W4KD3TXR" });
  });
  it.each([
    "I need it by next week",
    "next week",
    "send them",
    "best next",
    "FEEDBACK",
    "W4KD3TXR",
    "W4KD-3TXR",
    "W4KD 3TXR",
    "my code is W4KD-3TXR",
    "SHOP-6603",
    "OCITTEA59",
    "verify my order SHOP-6603",
    "",
    "   ",
    "/verify",
    "/verify 1234",
    "/verify MAIL-BOX1",
    "/verify W4KD-3TXR please",
  ])("does not start verification for %s", (text) => {
    expect(findAccessCodeCandidate(text)).toBeNull();
  });
  it("redacts new and historical code submissions without hiding the deadline regression", () => {
    for (const body of [
      "/verify W4KD-3TXR",
      "W4KD3TXR",
      "W4KD 3TXR",
      "my code is W4KD-3TXR",
    ]) {
      expect(redactAccessCode(body)).toBe("[Access code withheld]");
    }
    expect(redactAccessCode("I need it by next week")).toBe(
      "I need it by next week",
    );
    expect(redactAccessCode("SHOP-6603")).toBe("SHOP-6603");
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

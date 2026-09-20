import { describe, expect, it } from "vitest";
import { asksToRemember, isFarewell } from "./remember";

describe("asksToRemember", () => {
  it.each([
    "Remember that Sarasavi is our main competitor",
    "From now on keep answers to one sentence",
    "Don't forget I call BooXworm 'the bookshop'",
    "Always call me Walid",
  ])("hears %s", (said) => {
    expect(asksToRemember(said)).toBe(true);
  });

  it("does not treat ordinary questions as instructions", () => {
    expect(asksToRemember("What is our position on Google?")).toBe(false);
    expect(asksToRemember("Why are they gaining?")).toBe(false);
  });
});

describe("isFarewell", () => {
  it.each(["Thank you", "thanks, that's all", "Okay bye", "no more questions"])(
    "hangs up on %s",
    (said) => {
      expect(isFarewell(said)).toBe(true);
    },
  );

  it("keeps listening when the thanks carries another question", () => {
    expect(isFarewell("Thanks, and what about the rankings?")).toBe(false);
    expect(isFarewell("thanks, can you check BooXworm too")).toBe(false);
  });

  it("does not hang up on an ordinary answer", () => {
    expect(isFarewell("What is our position on Google?")).toBe(false);
    expect(isFarewell("")).toBe(false);
  });
});

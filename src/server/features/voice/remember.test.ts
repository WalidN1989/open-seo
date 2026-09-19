import { describe, expect, it } from "vitest";
import { asksToRemember } from "./remember";

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

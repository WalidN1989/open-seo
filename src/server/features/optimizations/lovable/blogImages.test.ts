import { describe, expect, it } from "vitest";
import { stylePrompt } from "./blogImages";

describe("stylePrompt", () => {
  it("sets each country's images in that country only", () => {
    expect(stylePrompt("a cafe", "au", true)).toContain("Set in Australia");
    expect(stylePrompt("a cafe", "lk", false)).toContain("Set in Sri Lanka");
    expect(stylePrompt("a cafe", "lk", false)).not.toContain("Australia");
  });

  it("keeps text and other brands out of the picture", () => {
    const prompt = stylePrompt("a shop", "au", true);
    expect(prompt).toContain("No text");
    expect(prompt).toContain("No logos");
  });
});

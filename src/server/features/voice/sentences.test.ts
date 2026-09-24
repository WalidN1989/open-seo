import { describe, expect, it } from "vitest";
import { finalSentence, speakable, takeSentences } from "./sentences";

describe("takeSentences", () => {
  it("hands over each sentence as it finishes and keeps the rest", () => {
    const first = takeSentences("Your position is fourteen. It slipped from");
    expect(first.sentences).toEqual(["Your position is fourteen."]);
    expect(first.rest.trim()).toBe("It slipped from");
    const second = takeSentences(`${first.rest} nine last month.`);
    expect(second.sentences).toEqual(["It slipped from nine last month."]);
    expect(second.rest.trim()).toBe("");
  });

  it("does not cut inside a number or an address", () => {
    const { sentences, rest } = takeSentences(
      "Traffic is 3.5 thousand a month on digitalurgency.lk right now",
    );
    expect(sentences).toEqual([]);
    expect(rest).toContain("3.5");
  });

  it("does not cut after an abbreviation", () => {
    expect(
      takeSentences("Fix the headings, e.g. the missing").sentences,
    ).toEqual([]);
  });

  it("holds back a piece too short to speak", () => {
    const { sentences, rest } = takeSentences("Yes. Your rankings are steady.");
    expect(sentences).toEqual(["Yes. Your rankings are steady."]);
    expect(rest).toBe("");
  });

  it("treats a line break as an end", () => {
    expect(
      takeSentences("Three things matter here\nThe first is").sentences,
    ).toEqual(["Three things matter here"]);
  });
});

describe("finalSentence", () => {
  it("speaks what is left when the model stops mid-sentence", () => {
    expect(finalSentence(" and that is the gap")).toBe("and that is the gap");
    expect(finalSentence("   ")).toBeNull();
  });
});

describe("speakable", () => {
  it("leaves addresses out of what is read aloud", () => {
    expect(speakable("Open https://digitalurgency.lk/blog for the list")).toBe(
      "Open for the list",
    );
  });
});

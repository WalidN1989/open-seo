import { describe, expect, it } from "vitest";
import { greetingName, greetingText } from "./greeting";

const orgs = ["Digital Urgency AUS", "Bestrends", "BooXworm"];

describe("greetingName", () => {
  it("uses a person's first name", () => {
    expect(greetingName("Walid Nazmi", orgs)).toBe("Walid");
  });

  it("never greets someone by their business's name", () => {
    expect(greetingName("DigitalUrgency", orgs)).toBe("");
    expect(greetingName("Bestrends", orgs)).toBe("");
  });

  it("skips names that are not words", () => {
    expect(greetingName("12", orgs)).toBe("");
    expect(greetingName("sales@digitalurgency.com.au", orgs)).toBe("");
    expect(greetingName(null, orgs)).toBe("");
  });
});

describe("greetingText", () => {
  it("is one short line, with or without a name", () => {
    expect(greetingText("Walid")).toBe("Hi Walid, how can I help you today?");
    expect(greetingText("")).toBe("Hi, how can I help you today?");
  });
});

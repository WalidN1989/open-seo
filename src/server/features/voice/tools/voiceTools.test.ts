import { describe, expect, it } from "vitest";
import { isAffirmative, matchLead, VOICE_TOOLS } from "./voiceTools";

describe("isAffirmative", () => {
  it.each(["Yes", "yes please", "go ahead", "okay do it", "run it"])(
    "hears agreement in %s",
    (said) => {
      expect(isAffirmative(said)).toBe(true);
    },
  );

  it.each(["no", "not now", "wait", "don't run it", "maybe later"])(
    "does not spend on %s",
    (said) => {
      expect(isAffirmative(said)).toBe(false);
    },
  );

  it("does not read a question as permission", () => {
    expect(isAffirmative("What would a rank check cost?")).toBe(false);
    expect(isAffirmative("")).toBe(false);
  });
});

describe("matchLead", () => {
  const leads = [
    {
      title: "Kids' sneakers — Hania",
      contactName: "Walid",
      companyName: null,
    },
    {
      title: "Phone enquiry",
      contactName: "Rasheed",
      companyName: "Bestrends",
    },
  ];

  it("finds the lead by its own name, the contact or the company", () => {
    expect(matchLead(leads, "kids sneakers hania")?.title).toBe(
      "Kids' sneakers — Hania",
    );
    expect(matchLead(leads, "Rasheed")?.title).toBe("Phone enquiry");
    expect(matchLead(leads, "bestrends")?.title).toBe("Phone enquiry");
  });

  it("returns nothing rather than guessing", () => {
    expect(matchLead(leads, "someone else entirely")).toBeNull();
  });
});

describe("VOICE_TOOLS", () => {
  it("warns the model that running a check spends money", () => {
    const run = VOICE_TOOLS.find((tool) => tool.name === "run_rank_check");
    expect(run?.description).toContain("SPENDS CREDITS");
  });

  it("offers nothing that publishes or approves on the person's behalf", () => {
    const names = VOICE_TOOLS.map((tool) => tool.name);
    expect(names).not.toContain("approve_optimization_opportunity");
    expect(names.some((name) => name.includes("publish"))).toBe(false);
    expect(names.some((name) => name.includes("delete_project"))).toBe(false);
  });
});

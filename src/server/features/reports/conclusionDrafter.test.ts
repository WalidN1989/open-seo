import { describe, expect, it } from "vitest";
import { parseSalesReply } from "./conclusionDrafter";

describe("parseSalesReply", () => {
  it("reads the conclusion and flags between the markers", () => {
    const parsed = parseSalesReply(`Sure.
===CONCLUSION===
**Where you stand.** You hold 5.0 from 5 reviews; JSM "Accounting" holds 4.8 from 146.

Local SEO and Google Business Profile optimisation closes that.
===RED FLAGS===
- Only 5 reviews
* Rank tracking not started
===END===`);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.conclusion.startsWith("**Where you stand.**")).toBe(
      true,
    );
    expect(parsed.data.conclusion.includes('"Accounting"')).toBe(true);
    expect(parsed.data.redFlags).toEqual([
      "Only 5 reviews",
      "Rank tracking not started",
    ]);
  });

  it("copes with a reply that forgot the flags section", () => {
    const parsed = parseSalesReply("===CONCLUSION===\nJust prose.\n===END===");
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.conclusion).toBe("Just prose.");
    expect(parsed.data.redFlags).toEqual([]);
  });
});

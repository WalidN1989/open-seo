import { describe, expect, it } from "vitest";
import { resolveProject } from "./projectResolution";

const bestrends = { id: "p1", name: "Bestrends", domain: "bestrends.lk" };
const bookshop = {
  id: "p2",
  name: "Bookshop Near Me",
  domain: "https://www.bookshopnearme.lk",
};
const southside = { id: "p3", name: "Southside Plumbing", domain: null };
const all = [bestrends, bookshop, southside];

describe("resolveProject", () => {
  it("never asks someone who has only one project", () => {
    expect(resolveProject([bestrends], [])).toBe(bestrends);
  });

  it("waits for a name when there are several", () => {
    expect(resolveProject(all, ["what is our position?"])).toBeNull();
  });

  it("hears names the way a transcriber writes them", () => {
    expect(resolveProject(all, ["tell me about best trends"])).toBe(bestrends);
    expect(resolveProject(all, ["bookshopnearme.lk please"])).toBe(bookshop);
    expect(resolveProject(all, ["the south side plumbing one"])).toBe(
      southside,
    );
  });

  it("forgives a misheard letter", () => {
    expect(resolveProject(all, ["look at bestrands"])).toBe(bestrends);
  });

  it("follows the conversation to the latest project named", () => {
    expect(
      resolveProject(all, [
        "bestrends first",
        "what's happening?",
        "now bookshop near me",
      ]),
    ).toBe(bookshop);
  });

  it("keeps the earlier choice through follow-up questions", () => {
    expect(resolveProject(all, ["bestrends", "why are they gaining?"])).toBe(
      bestrends,
    );
  });

  it("treats two projects in one sentence as undecided", () => {
    expect(
      resolveProject(all, ["compare bestrends and bookshop near me"]),
    ).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { isProjectAtAddress, projectAddress } from "./active-project";

const booxworm = {
  id: "fe7b986f-5a61-4eb1-ae08-280380c280d9",
  slug: "booxworm",
};
const legacy = { id: "f3dc21a2-4838-4fdc-9f56-6e348a98de18", slug: null };

describe("the address a project link uses", () => {
  it("prefers the slug, which is the readable half", () => {
    expect(projectAddress(booxworm)).toBe("booxworm");
  });

  it("falls back to the id for a project with no slug", () => {
    expect(projectAddress(legacy)).toBe(legacy.id);
  });
});

describe("recognising which project an address refers to", () => {
  it("matches on the slug", () => {
    expect(isProjectAtAddress(booxworm, "booxworm")).toBe(true);
  });

  // Every link shared or bookmarked before slugs existed carries the id, and
  // those still resolve — so the switcher has to recognise them too. Matching
  // on the id alone is what left it reading "Select project" with a project
  // plainly open.
  it("still matches on the id", () => {
    expect(isProjectAtAddress(booxworm, booxworm.id)).toBe(true);
    expect(isProjectAtAddress(legacy, legacy.id)).toBe(true);
  });

  it("does not match another project", () => {
    expect(isProjectAtAddress(booxworm, "period-lk")).toBe(false);
    expect(isProjectAtAddress(booxworm, legacy.id)).toBe(false);
  });

  // No project is open on the projects list or the landing redirect, and a
  // null slug must not be treated as matching a null address.
  it("matches nothing when there is no address", () => {
    expect(isProjectAtAddress(booxworm, null)).toBe(false);
    expect(isProjectAtAddress(legacy, null)).toBe(false);
  });
});

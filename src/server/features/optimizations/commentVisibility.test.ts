import { describe, expect, it } from "vitest";
import { isStaffRole, visibleComments } from "./commentVisibility";

const thread = [
  { id: "a", visibility: "client" },
  { id: "b", visibility: "internal" },
  { id: "c", visibility: "client" },
];

describe("who counts as staff", () => {
  it("is owners and admins only", () => {
    expect(isStaffRole("owner")).toBe(true);
    expect(isStaffRole("admin")).toBe(true);
  });

  it("is not a plain member, and not a missing membership", () => {
    for (const role of ["member", "viewer", "", null, undefined]) {
      expect(isStaffRole(role)).toBe(false);
    }
  });
});

describe("what a client sees", () => {
  it("hides internal notes", () => {
    expect(visibleComments(thread, false).map((c) => c.id)).toEqual(["a", "c"]);
  });

  it("shows staff everything, in order", () => {
    expect(visibleComments(thread, true).map((c) => c.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("treats an unrecognised visibility as internal, not as public", () => {
    // A new value must fail closed: leaking a note is worse than hiding one.
    const odd = [{ id: "x", visibility: "draft-only" }];
    expect(visibleComments(odd, false)).toEqual([]);
    expect(visibleComments(odd, true)).toHaveLength(1);
  });
});

import { describe, expect, it } from "vitest";
import {
  excludePathsSchema,
  findExcludingPath,
  splitExcludePathsInput,
} from "./audit-exclude-paths";
describe("audit excluded paths", () => {
  it("matches bounded prefixes/wildcards/end anchors against path and query", () => {
    expect(
      findExcludingPath(["/tags/"], "https://example.com/tags/books"),
    ).toBe("/tags/");
    expect(
      findExcludingPath(["/search*?q=*$"], "https://example.com/search?q=book"),
    ).toBe("/search*?q=*$");
    expect(
      findExcludingPath(["/cart$"], "https://example.com/cartoon"),
    ).toBeUndefined();
    expect(findExcludingPath(["/cart$"], "https://example.com/cart")).toBe(
      "/cart$",
    );
    expect(findExcludingPath(["/tags/"], "not a url")).toBeUndefined();
  });
  it("validates input bounds and splits the form without empty patterns", () => {
    expect(splitExcludePathsInput(" /tags/\n\n /search* ")).toEqual([
      "/tags/",
      "/search*",
    ]);
    expect(
      excludePathsSchema.safeParse(["https://elsewhere.test/"]).success,
    ).toBe(false);
    expect(excludePathsSchema.safeParse(Array(21).fill("/tags/")).success).toBe(
      false,
    );
    expect(excludePathsSchema.safeParse(["/" + "a".repeat(200)]).success).toBe(
      false,
    );
  });
});

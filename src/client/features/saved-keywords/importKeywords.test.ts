import { describe, expect, it } from "vitest";
import { parseKeywordImport } from "./importKeywords";
describe("keyword import", () => {
  it("keeps quoted CSV keywords intact and drops headers/duplicate case", () => {
    expect(
      parseKeywordImport(
        'keyword,volume\n"books, gifts",20\nBooks,10\nbooks,30',
      ),
    ).toEqual(["books, gifts", "Books"]);
  });
  it("handles plain lists and TSV without changing spelling", () => {
    expect(
      parseKeywordImport("Books Online\n\nBOOKS ONLINE\nSEO tools"),
    ).toEqual(["Books Online", "SEO tools"]);
    expect(parseKeywordImport("keywords\tvolume\nlocal seo\t25")).toEqual([
      "local seo",
    ]);
  });
});

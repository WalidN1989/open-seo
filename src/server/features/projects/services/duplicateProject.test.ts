import { describe, expect, it } from "vitest";
import {
  findDuplicateProject,
  normalizeDomainForCompare,
  normalizeName,
  type ProjectIdentity,
} from "./duplicateProject";

const project = (over: Partial<ProjectIdentity>): ProjectIdentity => ({
  id: "p1",
  name: "Springfield Lakes Accounting",
  domain: "slaccbook.com",
  archivedAt: null,
  ...over,
});

describe("normalisation", () => {
  it("ignores case and spacing in a name", () => {
    expect(normalizeName("  Springfield   Lakes  ")).toBe("springfield lakes");
    expect(normalizeName("SPRINGFIELD LAKES")).toBe("springfield lakes");
  });

  it("ignores scheme, www, and a trailing slash in a domain", () => {
    for (const input of [
      "https://www.slaccbook.com/",
      "http://slaccbook.com",
      "WWW.SLACCBOOK.COM",
      "slaccbook.com/",
    ]) {
      expect(normalizeDomainForCompare(input)).toBe("slaccbook.com");
    }
  });

  it("treats a missing domain as its own value, not a wildcard", () => {
    expect(normalizeDomainForCompare(null)).toBe("");
  });
});

describe("finding a duplicate", () => {
  it("catches the same project typed differently", () => {
    const found = findDuplicateProject(
      [project({})],
      { name: "  springfield lakes ACCOUNTING ", domain: "https://www.slaccbook.com/" },
    );
    expect(found?.id).toBe("p1");
  });

  it("allows the same name on a different site", () => {
    expect(
      findDuplicateProject([project({})], {
        name: "Springfield Lakes Accounting",
        domain: "another-site.com.au",
      }),
    ).toBeNull();
  });

  it("allows a different name on the same site", () => {
    expect(
      findDuplicateProject([project({})], {
        name: "SLACCBook Blog",
        domain: "slaccbook.com",
      }),
    ).toBeNull();
  });

  it("counts an archived project, because it can be restored", () => {
    const found = findDuplicateProject(
      [project({ archivedAt: "2026-09-01T00:00:00.000Z" })],
      { name: "Springfield Lakes Accounting", domain: "slaccbook.com" },
    );
    expect(found?.archivedAt).toBeTruthy();
  });

  it("catches two domainless projects with the same name", () => {
    const found = findDuplicateProject(
      [project({ domain: null, name: "Default" })],
      { name: "default", domain: null },
    );
    expect(found?.id).toBe("p1");
  });

  it("does not fire on an empty name", () => {
    expect(
      findDuplicateProject([project({})], { name: "   ", domain: "slaccbook.com" }),
    ).toBeNull();
  });
});

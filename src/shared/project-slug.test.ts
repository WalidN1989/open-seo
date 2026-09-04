import { describe, expect, it } from "vitest";
import { nextAvailableProjectSlug, toProjectSlug } from "./project-slug";

describe("turning a project name into an address", () => {
  it("lowercases and joins words with hyphens", () => {
    expect(toProjectSlug("Book Shop Near Me")).toBe("book-shop-near-me");
  });

  it("keeps a name that is already a single word", () => {
    expect(toProjectSlug("BooXworm")).toBe("booxworm");
  });

  // A domain-shaped name is common here — Period.lk, arijahconstruction.com.au
  // — and the dots have to become separators rather than survive into the path.
  it("turns punctuation into separators", () => {
    expect(toProjectSlug("Period.lk")).toBe("period-lk");
    expect(toProjectSlug("South Side Fencing")).toBe("south-side-fencing");
  });

  it("strips accents rather than dropping the letter", () => {
    expect(toProjectSlug("Café Rouge")).toBe("cafe-rouge");
  });

  it("never ends on a separator", () => {
    expect(toProjectSlug("Acme!!!")).toBe("acme");
    expect(toProjectSlug("  spaced  ")).toBe("spaced");
  });

  // The address has to resolve to something, and an empty segment would make
  // /p//dashboard.
  it("falls back rather than returning nothing", () => {
    expect(toProjectSlug("???")).toBe("project");
    expect(toProjectSlug("")).toBe("project");
  });
});

describe("choosing a free address", () => {
  it("uses the plain slug when nothing has taken it", () => {
    expect(nextAvailableProjectSlug("Acme", [])).toBe("acme");
  });

  // Slugs resolve without knowing whose project they are, so two agencies with
  // a client called Acme cannot both be /p/acme.
  it("numbers a collision rather than reusing it", () => {
    expect(nextAvailableProjectSlug("Acme", ["acme"])).toBe("acme-2");
    expect(nextAvailableProjectSlug("Acme", ["acme", "acme-2"])).toBe("acme-3");
  });

  it("ignores gaps and takes the first free number", () => {
    expect(nextAvailableProjectSlug("Acme", ["acme", "acme-3"])).toBe("acme-2");
  });

  it("is unaffected by unrelated slugs that merely start the same", () => {
    expect(nextAvailableProjectSlug("Acme", ["acmecorp", "acme-widgets"])).toBe(
      "acme",
    );
  });
});

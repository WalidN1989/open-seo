import { describe, expect, it, vi } from "vitest";

vi.mock(
  "@/server/features/communications/repositories/CommunicationsRepository",
  () => ({ CommunicationsRepository: {} }),
);
vi.mock("@/server/features/communications/providers/integrations", () => ({
  runApifyActor: vi.fn(),
  scrapeWithFirecrawl: vi.fn(),
}));

const { evidenceScore, toCandidate, toCandidates } =
  await import("./sourceAdapters");

describe("how much a candidate is worth reviewing", () => {
  it("weighs a way to contact them above a good reputation", () => {
    // Five stars and no phone number is not a lead anyone can work.
    const reachable = evidenceScore({ email: "a@b.com", phone: "+94112" });
    const admired = evidenceScore({ rating: 5, reviewCount: 900 });
    expect(reachable).toBeGreaterThan(admired);
  });

  it("scores a record with nothing on it as zero", () => {
    expect(evidenceScore({})).toBe(0);
  });

  it("never exceeds one hundred", () => {
    expect(
      evidenceScore({
        email: "a@b.com",
        phone: "1",
        website: "x.com",
        rating: 5,
        reviewCount: 500,
      }),
    ).toBe(100);
  });

  it("does not reward a poor rating", () => {
    expect(evidenceScore({ rating: 2 })).toBe(0);
  });
});

describe("reading a provider record", () => {
  it("finds the company name whatever the provider calls it", () => {
    expect(toCandidate("apify", { title: "Book House" }, 0)?.companyName).toBe(
      "Book House",
    );
    expect(
      toCandidate("apify", { businessName: "Book House" }, 0)?.companyName,
    ).toBe("Book House");
  });

  it("drops a record with no company name", () => {
    // It cannot be shown to a reviewer or deduplicated against anything.
    expect(toCandidate("apify", { phone: "123" }, 0)).toBeNull();
  });

  it("falls back to a derived id when the provider gives none", () => {
    const draft = toCandidate("apify", { name: "Book House" }, 3);
    expect(draft?.externalId).toBe("book-house-3");
  });

  it("rounds a fractional rating rather than storing a float", () => {
    const draft = toCandidate("apify", { name: "X", rating: "4.6" }, 0);
    expect(draft?.rating).toBe(5);
  });

  it("leaves absent numbers null rather than turning them into zero", () => {
    const draft = toCandidate("apify", { name: "X" }, 0);
    expect(draft?.rating).toBeNull();
    expect(draft?.reviewCount).toBeNull();
  });
});

describe("a batch from one response", () => {
  it("drops a repeat the provider returned twice", () => {
    // Left in, the unique index rejects the second row and takes the whole
    // batch with it, so an entire search would return nothing.
    const drafts = toCandidates(
      "apify",
      [
        { id: "p1", name: "Book House" },
        { id: "p1", name: "Book House" },
        { id: "p2", name: "Paper Trail" },
      ],
      50,
    );
    expect(drafts).toHaveLength(2);
  });

  it("skips entries that are not records at all", () => {
    expect(
      toCandidates("apify", [null, "text", 42, { name: "Ok" }], 50),
    ).toHaveLength(1);
  });

  it("honours the requested limit", () => {
    const records = Array.from({ length: 10 }, (_, index) => ({
      id: `p${index}`,
      name: `Shop ${index}`,
    }));
    expect(toCandidates("apify", records, 4)).toHaveLength(4);
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {}, waitUntil: vi.fn() }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("../repositories/OptimizationRepository", () => ({
  OptimizationRepository: { update: vi.fn() },
}));
vi.mock(
  "@/server/features/business-modules/repositories/BusinessAuditRepository",
  () => ({ BusinessAuditRepository: { record: vi.fn() } }),
);

import { planServiceEdit, pushServiceEdit } from "./servicePublisher";

const FILE = `export interface Service {
  slug: string;
  title: string;
}

export const services: Service[] = [
  {
    slug: "seo-services-sri-lanka",
    title: "SEO Services in Sri Lanka",
    description: "Work with a named SEO specialist.",
    priceFrom: 25000,
    seo: {
      title: "SEO Services in Sri Lanka | DigitalUrgency",
      description: "Rank on Google.lk.",
      keywords: ["seo services sri lanka", "seo agency colombo"],
    },
  },
];
`;

const site = {
  token: "t",
  repository: "WalidN1989/digitalurgency.lk",
  branch: "main",
  siteUrl: "https://www.digitalurgency.lk",
};

/** GitHub with the services file on it, accepting every write. */
function github(written: string[], file = FILE) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String(input);
    if (url.includes("/contents/src/data/services.ts")) {
      return Response.json({ content: btoa(file) });
    }
    if (url.endsWith("/git/ref/heads/main"))
      return Response.json({ object: { sha: "h" } });
    if (url.endsWith("/git/commits/h"))
      return Response.json({ sha: "h", tree: { sha: "t0" } });
    if (url.endsWith("/git/blobs")) {
      const body: unknown = JSON.parse(String(init?.body ?? "{}"));
      written.push(String(Reflect.get(body as object, "content")));
      return Response.json({ sha: "b" });
    }
    if (url.endsWith("/git/trees")) return Response.json({ sha: "t1" });
    if (url.endsWith("/git/commits"))
      return Response.json({ sha: "c", tree: { sha: "t1" } });
    return Response.json({});
  };
}

describe("planServiceEdit", () => {
  it("puts the target keyword first and keeps the page's own", () => {
    const patch = planServiceEdit({
      draft: { title: "SEO Services Sri Lanka | Colombo SEO Company" },
      keyword: "seo company colombo",
      existingKeywords: ["seo services sri lanka", "seo company colombo"],
    });
    expect(patch?.keywords).toEqual([
      "seo company colombo",
      "seo services sri lanka",
    ]);
  });

  it("has nothing to say about a draft with no words in it", () => {
    expect(
      planServiceEdit({ draft: {}, keyword: "x", existingKeywords: [] }),
    ).toBeNull();
  });
});

describe("pushServiceEdit", () => {
  it("commits the page's new search title and its article", async () => {
    const written: string[] = [];
    const result = await pushServiceEdit({
      site,
      slug: "seo-services-sri-lanka",
      draft: {
        title: "SEO Services Sri Lanka | Colombo SEO Company",
        metaDescription: "Fixed rupee packages.",
        body: "## SEO packages\n\nFrom LKR 25,000.",
      },
      keyword: "seo services sri lanka",
      opportunityId: "opp",
      fetcher: github(written),
    });
    expect(result.url).toBe(
      "https://www.digitalurgency.lk/services/seo-services-sri-lanka",
    );
    const [file] = written;
    expect(file).toContain(
      'title: "SEO Services Sri Lanka | Colombo SEO Company"',
    );
    expect(file).toContain("<h2>SEO packages</h2>");
    // The business's own answers are not this app's to change.
    expect(file).toContain("priceFrom: 25000");
    expect(file).toContain('description: "Work with a named SEO specialist."');
  });

  it("says so when the site has no such service, and writes nothing", async () => {
    const written: string[] = [];
    await expect(
      pushServiceEdit({
        site,
        slug: "not-a-service",
        draft: { title: "T", body: "B" },
        keyword: "k",
        opportunityId: "opp",
        fetcher: github(written),
      }),
    ).rejects.toThrow("no service page at /services/not-a-service");
    expect(written).toEqual([]);
  });
});

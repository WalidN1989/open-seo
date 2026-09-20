import { describe, expect, it } from "vitest";
import { patchService } from "./servicePatch";
import { parseServices } from "./siteServices";

const FILE = `export interface Service {
  slug: string;
  title: string;
  priceFrom: number; // LKR
}

export const services: Service[] = [
  {
    slug: "seo-services-sri-lanka",
    title: "SEO Services in Sri Lanka",
    description: "Work with a named SEO specialist.",
    priceFrom: 25000,
    // A person wrote this note by hand.
    faqs: [{ q: "How long?", a: "Ninety days." }],
    seo: {
      title: "SEO Services in Sri Lanka | DigitalUrgency",
      description: "Rank on Google.lk.",
      keywords: ["seo services sri lanka"],
    },
  },
  {
    slug: "google-maps-seo",
    title: "Google Maps SEO",
    description: "Get found in the Map Pack.",
    priceFrom: 15000,
  },
];
`;

describe("patchService", () => {
  it("changes the service named and leaves its neighbour alone", () => {
    const next = patchService(FILE, "seo-services-sri-lanka", {
      description: "A named specialist, a fixed rupee price.",
    });
    const services = parseServices(next ?? "");
    expect(services[0]?.description).toBe(
      "A named specialist, a fixed rupee price.",
    );
    expect(services[1]?.description).toBe("Get found in the Map Pack.");
    // Everything the patch did not name survives, comments included.
    expect(next).toContain("A person wrote this note by hand.");
    expect(next).toContain('a: "Ninety days."');
    expect(next).toContain("priceFrom: 25000");
  });

  it("writes the title and description Google shows", () => {
    const next = patchService(FILE, "seo-services-sri-lanka", {
      seoTitle: "SEO Services Sri Lanka | Colombo SEO Company",
      seoDescription: "Fixed rupee packages and monthly reporting.",
      keywords: ["seo services sri lanka", "seo company colombo"],
    });
    expect(next).toContain(
      'title: "SEO Services Sri Lanka | Colombo SEO Company"',
    );
    expect(next).toContain(
      'description: "Fixed rupee packages and monthly reporting."',
    );
    expect(parseServices(next ?? "")[0]?.keywords).toEqual([
      "seo services sri lanka",
      "seo company colombo",
    ]);
    // The service's own description is a different field and is untouched.
    expect(next).toContain('description: "Work with a named SEO specialist."');
  });

  it("gives a service with no seo block one", () => {
    const next = patchService(FILE, "google-maps-seo", {
      seoTitle: "Google Maps SEO in Sri Lanka",
      keywords: ["google maps seo sri lanka"],
    });
    expect(parseServices(next ?? "")[1]?.primaryKeyword).toBe(
      "google maps seo sri lanka",
    );
    expect(next).toContain('title: "Google Maps SEO in Sri Lanka"');
  });

  it("declares the article field before writing one, so the site still builds", () => {
    const next = patchService(FILE, "google-maps-seo", {
      article: "<h2>What we do</h2><p>Local signals, every week.</p>",
    });
    expect(next).toContain("article?: string;");
    expect(next).toContain(
      'article: "<h2>What we do</h2><p>Local signals, every week.</p>"',
    );
    // Declared once, however many services carry one.
    const twice = patchService(next ?? "", "seo-services-sri-lanka", {
      article: "<p>Another.</p>",
    });
    expect(twice?.match(/article\?: string;/g)).toHaveLength(1);
  });

  it("escapes what it writes, so a quote cannot break the file", () => {
    const next = patchService(FILE, "google-maps-seo", {
      description: 'They said "near me" and meant it — \\ backslash too.',
    });
    expect(parseServices(next ?? "")[1]?.description).toBe(
      'They said "near me" and meant it — \\ backslash too.',
    );
  });

  it("refuses a slug the file does not have", () => {
    expect(
      patchService(FILE, "not-a-service", { description: "x" }),
    ).toBeNull();
  });
});

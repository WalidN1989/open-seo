import { describe, expect, it } from "vitest";
import { parseServices } from "./siteServices";

/**
 * The shape these sites actually write: a type declaration first, then the
 * list. The declaration carries `slug: string` with no value, and benefit
 * blocks inside a service carry their own `title`, so both are places a
 * careless reader invents a service that does not exist.
 */
const FILE = `export interface Service {
  slug: string;
  title: string;
  priceFrom: number; // LKR
}

export const services: Service[] = [
  {
    slug: "seo-services-sri-lanka",
    title: "SEO Services in Sri Lanka",
    category: "SEO",
    description:
      "Work with a named SEO specialist. Every engagement starts with a free audit.",
    priceFrom: 25000,
    priceType: "monthly",
    benefits: [
      { title: "A named specialist", body: "Not a ticket queue." },
    ],
    seo: {
      title: "SEO Services in Sri Lanka | DigitalUrgency",
      description: "Rank on Google.lk for searches that lead to enquiries.",
      keywords: ["seo services sri lanka", "seo agency colombo"],
    },
  },
  {
    slug: "google-maps-seo",
    title: "Google Maps SEO",
    category: "SEO",
    description: "Get found in the Google Map Pack.",
    priceFrom: 15000,
  },
];
`;

describe("parseServices", () => {
  it("reads every service the site lists, and nothing else", () => {
    const services = parseServices(FILE);
    expect(services.map((service) => service.slug)).toEqual([
      "seo-services-sri-lanka",
      "google-maps-seo",
    ]);
  });

  it("takes the service's own title, not the one inside its benefits", () => {
    const [first] = parseServices(FILE);
    expect(first?.title).toBe("SEO Services in Sri Lanka");
    expect(first?.description).toBe(
      "Work with a named SEO specialist. Every engagement starts with a free audit.",
    );
    expect(first?.priceFrom).toBe(25000);
    expect(first?.priceType).toBe("monthly");
  });

  it("reports the keyword the page is written for", () => {
    const [first, second] = parseServices(FILE);
    expect(first?.primaryKeyword).toBe("seo services sri lanka");
    expect(first?.keywords).toHaveLength(2);
    // A page with no recorded keyword is still a page, and still listed.
    expect(second?.primaryKeyword).toBeNull();
    expect(second?.priceType).toBeNull();
  });

  it("returns nothing for a file that holds no services", () => {
    expect(parseServices("export const services = [];")).toEqual([]);
  });
});

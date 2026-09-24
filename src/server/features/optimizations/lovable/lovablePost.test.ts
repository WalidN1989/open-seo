import { describe, expect, it } from "vitest";
import { planPost, renderPost, siteFor } from "./lovablePost";

const draft = {
  title: "How Shopify Works for Australian Businesses",
  metaDescription: "Shopify for Australian businesses, explained.",
  body: [
    "# How Shopify Works for Australian Businesses",
    "",
    "Intro paragraph.",
    "",
    "![A Sydney shop owner at a laptop][IMAGE: shop owner checking orders on a laptop in a Sydney cafe]",
    "",
    "## Pricing",
    "",
    "![Pricing table](IMAGE: simple illustration of three price tiers)",
  ].join("\n"),
  images: [
    {
      placement: "hero",
      alt: "Shopify on a laptop",
      prompt: "a laptop showing an online store",
    },
  ],
};

describe("planPost", () => {
  const plan = planPost({
    draft,
    keyword: "how shopify works",
    path: "/blog/how-shopify-works-for-australian-businesses/",
    site: "au",
  });

  it("reads slug, title and description", () => {
    expect(plan?.slug).toBe("how-shopify-works-for-australian-businesses");
    expect(plan?.title).toBe("How Shopify Works for Australian Businesses");
    expect(plan?.description).toContain("Shopify");
  });

  it("plans the hero first, then each placeholder in reading order", () => {
    expect(plan?.images.map((image) => image.key)).toEqual([
      "hero",
      "inline-1",
      "inline-2",
    ]);
    expect(plan?.images[0]?.prompt).toBe("a laptop showing an online store");
    expect(plan?.images[1]?.prompt).toContain("Sydney cafe");
    expect(plan?.images[2]?.alt).toBe("Pricing table");
  });

  it("drops the duplicate leading title from the body", () => {
    expect(plan?.markdown.startsWith("Intro paragraph.")).toBe(true);
  });

  it("describes a hero from the title when the writer gave none", () => {
    const bare = planPost({
      draft: { title: "SEO in Colombo", body: "Text." },
      keyword: "seo colombo",
      path: null,
      site: "lk",
    });
    expect(bare?.images).toHaveLength(1);
    expect(bare?.images[0]?.prompt).toContain("Sri Lanka");
  });

  it("does not repeat the hero as an in-article image", () => {
    const repeat = planPost({
      draft: {
        title: "Book shops",
        body: "Intro.\n\n![Cafe][IMAGE: A paperback on a cafe table]\n\nMore.",
        images: [
          {
            placement: "hero",
            alt: "Cafe",
            prompt: "A paperback on a café table",
          },
        ],
      },
      keyword: "book shops",
      path: null,
      site: "lk",
    });
    expect(repeat?.images.map((image) => image.key)).toEqual(["hero"]);
    expect(repeat?.markdown).not.toContain("IMAGE");
  });

  it("returns nothing without a title or body", () => {
    expect(
      planPost({
        draft: { title: "Only a title" },
        keyword: "x",
        path: null,
        site: "au",
      }),
    ).toBeNull();
  });
});

describe("renderPost", () => {
  const plan = planPost({
    draft,
    keyword: "how shopify works",
    path: null,
    site: "au",
  });
  if (!plan) throw new Error("plan expected");
  const post = renderPost({
    plan,
    siteUrl: "https://digitalurgency.com.au/",
    date: "2026-09-20",
    keyword: "how shopify works",
    opportunityId: "opp-1",
    imageSources: {
      hero: `/blog-images/${plan.slug}/hero.webp`,
      "inline-1": `/blog-images/${plan.slug}/inline-1.webp`,
      // inline-2 failed: it must vanish, not render broken
    },
  });

  it("matches the shape the Lovable blog reads", () => {
    expect(Object.keys(post)).toEqual(
      expect.arrayContaining([
        "slug",
        "title",
        "description",
        "date",
        "category",
        "author",
        "heroImage",
        "html",
      ]),
    );
  });

  it("makes the hero absolute for og:image and keeps body images relative", () => {
    expect(post.heroImage).toBe(
      `https://digitalurgency.com.au/blog-images/${plan.slug}/hero.webp`,
    );
    expect(post.html).toContain(
      `src="/blog-images/${plan.slug}/inline-1.webp"`,
    );
  });

  it("leaves out an image that could not be made", () => {
    expect(post.html).not.toContain("inline-2");
    expect(post.html).not.toContain("{{image");
    expect(post.html).not.toContain("IMAGE:");
  });

  it("leaves no stray preload tags in the article", () => {
    expect(post.html).not.toContain("<link");
  });

  it("never writes an h1 into the body", () => {
    expect(post.html).not.toContain("<h1");
  });
});

describe("siteFor", () => {
  it("keeps Australia and Sri Lanka apart by address", () => {
    expect(siteFor("https://www.digitalurgency.lk")).toBe("lk");
    expect(siteFor("https://digitalurgency.com.au")).toBe("au");
  });
});

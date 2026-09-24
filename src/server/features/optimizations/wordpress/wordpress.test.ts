import { describe, expect, it } from "vitest";
import { articleFromDraft, slugFrom } from "./wordpressArticle";
import { publishToWordpress, siteOrigin } from "./wordpressClient";

const refusing: typeof fetch = async () =>
  Response.json({ code: "rest_forbidden", message: "no" }, { status: 401 });

const credentials = {
  siteUrl: "https://bookshop.test",
  username: "editor",
  applicationPassword: "abcd efgh ijkl",
};

describe("articleFromDraft", () => {
  it("applies the approved words, without a doubled title or image notes", () => {
    const article = articleFromDraft({
      draft: {
        title: "How to Buy Books Online in Sri Lanka",
        metaDescription: "A practical guide.",
        body: "# How to buy books online in Sri Lanka\n\nIntro **bold**.\n\n![hero](IMAGE: courier at a gate)\n\n## Why COD\n\n- one\n- two",
      },
      keyword: "online book shopping",
      path: "/blog/buy-books-online-sri-lanka-cash-on-delivery/",
    });
    expect(article?.slug).toBe("buy-books-online-sri-lanka-cash-on-delivery");
    expect(article?.excerpt).toBe("A practical guide.");
    expect(article?.html).not.toContain("<h1>");
    expect(article?.html).not.toContain("IMAGE");
    expect(article?.html).toContain("<strong>bold</strong>");
    expect(article?.html).toContain("<h2>Why COD</h2>");
    expect(article?.html).toContain("<li>two</li>");
  });

  it("refuses a draft with no title or body", () => {
    expect(
      articleFromDraft({ draft: { title: "x" }, keyword: "k", path: null }),
    ).toBeNull();
    expect(slugFrom(null, "Book Shops in Colombo!")).toBe(
      "book-shops-in-colombo",
    );
  });
});

describe("publishToWordpress", () => {
  it("updates the post already at that slug instead of making a copy", async () => {
    const calls: { url: string; method: string; body: string }[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : "";
      calls.push({
        url,
        method: init?.method ?? "GET",
        body: typeof init?.body === "string" ? init.body : "",
      });
      return url.includes("?slug=")
        ? Response.json([{ id: 42 }])
        : Response.json({
            id: 42,
            link: "https://bookshop.test/blog/x/",
            status: "publish",
          });
    };
    const result = await publishToWordpress(
      credentials,
      { title: "T", excerpt: null, slug: "x", html: "<p>b</p>" },
      "posts",
      fetcher,
    );
    expect(result).toEqual({
      postId: 42,
      url: "https://bookshop.test/blog/x/",
      status: "publish",
      updatedExisting: true,
    });
    expect(calls[1]?.url).toBe("https://bookshop.test/wp-json/wp/v2/posts/42");
    expect(calls[1]?.body).toContain('"status":"publish"');
  });

  it("explains a refused login and never sends over plain http", async () => {
    await expect(
      publishToWordpress(
        credentials,
        { title: "T", excerpt: null, slug: "x", html: "" },
        "posts",
        refusing,
      ),
    ).rejects.toThrow("WordPress refused the login");
    await expect(
      publishToWordpress(
        { ...credentials, siteUrl: "http://bookshop.test" },
        { title: "T", excerpt: null, slug: "x", html: "" },
        "posts",
        refusing,
      ),
    ).rejects.toThrow("https://");
  });
});

describe("siteOrigin", () => {
  it("reads a bare domain as https", () => {
    expect(siteOrigin("bookshopnearme.lk")).toBe("https://bookshopnearme.lk");
    expect(siteOrigin(" https://bookshopnearme.lk/blog ")).toBe(
      "https://bookshopnearme.lk",
    );
  });
});

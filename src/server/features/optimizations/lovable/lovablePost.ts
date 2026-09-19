import {
  draftField,
  markdownToHtml,
  slugFrom,
  withoutLeadingTitle,
} from "../wordpress/wordpressArticle";

/**
 * An approved blog draft as a post for a Lovable site's file-based blog: one
 * JSON file at src/content/blog/<slug>.json, with its images committed beside
 * it under public/blog-images/<slug>/. Pure — no network, no clock.
 *
 * The shape is the one those sites already read (src/lib/blog.ts): slug,
 * title, description, date, category, author, heroImage, html. Nothing new is
 * invented on the site side; two extra fields record where the post came from.
 */

export type BlogSite = "au" | "lk";

export type PlannedImage = {
  /** Stable name: "hero", "inline-1", "inline-2"… — also the file name. */
  key: string;
  placement: "hero" | "inline";
  alt: string;
  prompt: string;
  /** An https image already chosen by the writer; nothing is generated. */
  existingUrl: string | null;
};

export type PostPlan = {
  slug: string;
  title: string;
  description: string;
  /** The body with each image placeholder replaced by a {{image:key}} marker. */
  markdown: string;
  images: PlannedImage[];
};

const PLACEHOLDER =
  /!\[([^\]]*)\](?:\[IMAGE:\s*([^\]]*)\]|\(IMAGE:\s*([^)]*)\))/gi;
const MARKER = /\{\{image:([a-z0-9-]+)\}\}/g;

const PLACE: Record<BlogSite, string> = {
  au: "Australia",
  lk: "Sri Lanka",
};

function httpsUrl(value: unknown) {
  return typeof value === "string" && /^https:\/\//i.test(value.trim())
    ? value.trim()
    : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

/** The writer's images list, read defensively: agents write it by hand. */
function draftImages(draft: unknown) {
  if (!draft || typeof draft !== "object") return [];
  const images: unknown = Reflect.get(draft, "images");
  if (!Array.isArray(images)) return [];
  return images.flatMap((item: unknown) =>
    item && typeof item === "object"
      ? [
          {
            placement: text(Reflect.get(item, "placement")),
            alt: text(Reflect.get(item, "alt")),
            prompt: text(Reflect.get(item, "prompt")),
            url: httpsUrl(Reflect.get(item, "url")),
          },
        ]
      : [],
  );
}

function plain(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Two descriptions of the same picture: "café" and "cafe" match. */
function samePicture(a: string, b: string) {
  return plain(a) === plain(b);
}

export function planPost(input: {
  draft: unknown;
  keyword: string;
  path: string | null;
  site: BlogSite;
}): PostPlan | null {
  const title = draftField(input.draft, "title", "h1", "headline");
  const body = draftField(input.draft, "body", "content", "markdown");
  if (!title || !body) return null;
  const listed = draftImages(input.draft);

  const heroListed = listed.find((item) => item.placement === "hero");

  // Every inline placeholder becomes a numbered image, in reading order —
  // except one that repeats the hero, which the reader has already seen.
  const inline: PlannedImage[] = [];
  const markdown = withoutLeadingTitle(body, title).replace(
    PLACEHOLDER,
    (_match, alt: string, bracket?: string, paren?: string) => {
      const key = `inline-${inline.length + 1}`;
      const described = (bracket ?? paren ?? "").trim();
      const cleanAlt = alt.trim() || described || title;
      if (
        heroListed?.prompt &&
        samePicture(described || cleanAlt, heroListed.prompt)
      ) {
        return "";
      }
      inline.push({
        key,
        placement: "inline",
        alt: cleanAlt,
        prompt: described || cleanAlt,
        existingUrl:
          listed.find((item) => item.url && item.alt === cleanAlt)?.url ?? null,
      });
      return `{{image:${key}}}`;
    },
  );

  // Every post gets a hero. Written by the agent if it gave one; otherwise
  // described from the title and keyword, set in the right country.
  const hero: PlannedImage = {
    key: "hero",
    placement: "hero",
    alt: heroListed?.alt || title,
    prompt:
      heroListed?.prompt ||
      `${title}. The article is about "${input.keyword}" for businesses in ${PLACE[input.site]}.`,
    existingUrl: heroListed?.url ?? null,
  };

  return {
    slug: slugFrom(input.path, title),
    title,
    description:
      draftField(
        input.draft,
        "metaDescription",
        "meta_description",
        "excerpt",
      ) ?? "",
    markdown,
    images: [hero, ...inline],
  };
}

/** Where a generated image lives in the repo, and the path the site serves. */
export function imagePaths(slug: string, key: string, extension: string) {
  const file = `${key}.${extension}`;
  return {
    repoPath: `public/blog-images/${slug}/${file}`,
    sitePath: `/blog-images/${slug}/${file}`,
  };
}

/**
 * The post file. Body images use site-relative paths so they show in
 * Lovable's preview and on the live site alike; the hero is absolute because
 * it also becomes the og:image, which crawlers need in full.
 */
export function renderPost(input: {
  plan: PostPlan;
  siteUrl: string;
  date: string;
  keyword: string;
  opportunityId: string;
  /** key → site path of the committed image, or an https URL. */
  imageSources: Record<string, string>;
  category?: string;
}) {
  const { plan } = input;
  const alts = new Map(plan.images.map((image) => [image.key, image.alt]));
  // An inline image that could not be made is dropped with its line, rather
  // than leaving a broken image in the article.
  const markdown = plan.markdown.replace(MARKER, (_match, key: string) => {
    const source = input.imageSources[key];
    return source ? `![${alts.get(key) ?? ""}](${source})` : "";
  });
  const hero = input.imageSources.hero;
  const origin = input.siteUrl.replace(/\/+$/, "");
  return {
    slug: plan.slug,
    title: plan.title,
    description: plan.description,
    date: input.date,
    category: input.category ?? "Insights",
    author: "DigitalUrgency Team",
    ...(hero
      ? { heroImage: hero.startsWith("/") ? `${origin}${hero}` : hero }
      : {}),
    html: markdownToHtml(markdown),
    keyword: input.keyword,
    openseoOpportunityId: input.opportunityId,
  };
}

/** Which country's site a project publishes to, read from its address. */
export function siteFor(siteUrl: string): BlogSite {
  return new URL(siteUrl).hostname.endsWith(".lk") ? "lk" : "au";
}

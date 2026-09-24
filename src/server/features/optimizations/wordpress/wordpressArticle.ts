import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * The approved draft as a WordPress post: title, excerpt, slug and HTML. The
 * words are applied as approved; the only changes are mechanical ones a
 * theme needs, so nothing a reviewer did not see goes live.
 */

export type WordpressArticle = {
  title: string;
  excerpt: string | null;
  slug: string;
  html: string;
};

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function draftField(draft: unknown, ...keys: string[]) {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) return null;
  for (const key of keys) {
    const found = text(Reflect.get(draft, key));
    if (found) return found;
  }
  return null;
}

/** "/blog/book-shops-in-colombo/" or a full URL → "book-shops-in-colombo". */
export function slugFrom(path: string | null, fallback: string) {
  const segment = (path ?? "")
    .replace(/^https?:\/\/[^/]+/i, "")
    .split("/")
    .filter(Boolean)
    .at(-1);
  const source = segment || fallback;
  return source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 190);
}

const IMAGE_PLACEHOLDER =
  /!\[[^\]]*\](?:\[IMAGE:[^\]]*\]|\(IMAGE:[^)]*\))\s*/gi;

function normalise(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Themes print the post title above the content, so a body that opens with
 * the same heading shows it twice — which is how the first live post looked.
 */
export function withoutLeadingTitle(body: string, title: string) {
  const match = /^\s*#\s+(.+?)\s*(?:\n|$)/.exec(body);
  if (!match) return body;
  return normalise(match[1] ?? "") === normalise(title)
    ? body.slice(match[0].length)
    : body;
}

export function articleFromDraft(input: {
  draft: unknown;
  keyword: string;
  path: string | null;
}): WordpressArticle | null {
  const title = draftField(input.draft, "title", "h1", "headline");
  const body = draftField(input.draft, "body", "content", "markdown");
  if (!title || !body) return null;
  const markdown = withoutLeadingTitle(body, title).replace(
    IMAGE_PLACEHOLDER,
    "",
  );
  return {
    title,
    excerpt: draftField(
      input.draft,
      "metaDescription",
      "meta_description",
      "excerpt",
    ),
    slug: slugFrom(input.path, title),
    html: renderToStaticMarkup(
      createElement(Markdown, { remarkPlugins: [remarkGfm] }, markdown),
    ),
  };
}

/** Markdown to the HTML fragment a CMS stores, rendered the same way everywhere. */
export function markdownToHtml(markdown: string) {
  // React's server renderer hoists a <link rel="preload"> for every image it
  // meets; in a stored article fragment those are stray tags, not hints.
  return renderToStaticMarkup(
    createElement(Markdown, { remarkPlugins: [remarkGfm] }, markdown),
  ).replace(/<link rel="preload" as="image"[^>]*>/g, "");
}

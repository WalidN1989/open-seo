/**
 * Editing one service inside a site's services file.
 *
 * These sites keep every service in a single hand-written TypeScript file, so
 * publishing to a service page means changing a few fields of one entry and
 * leaving the other 27 exactly as they were — including their comments,
 * their spacing, and whatever a person wrote there by hand.
 *
 * Pure: text in, text out. Nothing here talks to GitHub, and nothing decides
 * whether the change is a good one.
 */

export type ServicePatch = {
  /** The lead paragraph under the page's heading. */
  description?: string;
  /** The <title> and meta description Google shows. */
  seoTitle?: string;
  seoDescription?: string;
  keywords?: string[];
  /** Long-form body, already HTML, rendered under the structured blocks. */
  article?: string;
};

const DESCRIPTION_FIELD = /(\bdescription:\s*(?:\r?\n\s*)?)"(?:[^"\\]|\\.)*"/;
const TITLE_FIELD = /(\btitle:\s*(?:\r?\n\s*)?)"(?:[^"\\]|\\.)*"/;
const KEYWORDS_FIELD = /(\bkeywords:\s*)\[[\s\S]*?\]/;
const ARTICLE_FIELD = /(\barticle:\s*)"(?:[^"\\]|\\.)*"/;
const SLUG_VALUE = /\bslug:\s*"([^"]+)"/g;

/** JSON's string rules are JavaScript's, so this is the safe way to quote. */
function quoted(value: string) {
  return JSON.stringify(value);
}

function endOfString(source: string, start: number) {
  const quote = source[start];
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    if (character === "\\") {
      index += 1;
      continue;
    }
    if (character === quote) return index;
  }
  return source.length;
}

/**
 * The index of the `}` that closes the `{` at `open`.
 *
 * Braces inside strings and line comments are not braces, which is why this
 * walks the text rather than counting characters.
 */
function closingBrace(source: string, open: number) {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"' || character === "'" || character === "`") {
      index = endOfString(source, index);
      continue;
    }
    if (character === "/" && source[index + 1] === "/") {
      const lineEnd = source.indexOf("\n", index);
      index = lineEnd === -1 ? source.length : lineEnd;
      continue;
    }
    if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/** Where one service's object literal begins and ends. */
function entryBounds(source: string, slug: string) {
  for (const match of source.matchAll(SLUG_VALUE)) {
    if (match[1] !== slug || match.index === undefined) continue;
    const open = source.lastIndexOf("{", match.index);
    if (open === -1) return null;
    const close = closingBrace(source, open);
    return close === -1 ? null : { open, close };
  }
  return null;
}

/** Put a field the entry does not have yet just before its closing brace. */
function withField(entry: string, line: string) {
  const close = entry.lastIndexOf("}");
  if (close === -1) return entry;
  const before = entry.slice(0, close).replace(/\s*$/, "");
  const separator = before.endsWith(",") ? "" : ",";
  return `${before}${separator}\n${line}\n  ${entry.slice(close)}`;
}

function patchSeo(entry: string, patch: ServicePatch) {
  const wanted =
    patch.seoTitle !== undefined ||
    patch.seoDescription !== undefined ||
    patch.keywords !== undefined;
  if (!wanted) return entry;

  const marker = entry.search(/\bseo:\s*\{/);
  if (marker === -1) {
    const lines = [
      "    seo: {",
      ...(patch.seoTitle === undefined
        ? []
        : [`      title: ${quoted(patch.seoTitle)},`]),
      ...(patch.seoDescription === undefined
        ? []
        : [`      description: ${quoted(patch.seoDescription)},`]),
      ...(patch.keywords === undefined
        ? []
        : [`      keywords: [${patch.keywords.map(quoted).join(", ")}],`]),
      "    },",
    ];
    return withField(entry, lines.join("\n"));
  }

  const open = entry.indexOf("{", marker);
  const close = closingBrace(entry, open);
  if (close === -1) return entry;
  let seo = entry.slice(open, close + 1);
  if (patch.seoTitle !== undefined) {
    seo = TITLE_FIELD.test(seo)
      ? seo.replace(TITLE_FIELD, `$1${quoted(patch.seoTitle)}`)
      : withField(seo, `      title: ${quoted(patch.seoTitle)},`);
  }
  if (patch.seoDescription !== undefined) {
    seo = DESCRIPTION_FIELD.test(seo)
      ? seo.replace(DESCRIPTION_FIELD, `$1${quoted(patch.seoDescription)}`)
      : withField(seo, `      description: ${quoted(patch.seoDescription)},`);
  }
  if (patch.keywords !== undefined) {
    const list = `[${patch.keywords.map(quoted).join(", ")}]`;
    seo = KEYWORDS_FIELD.test(seo)
      ? seo.replace(KEYWORDS_FIELD, `$1${list}`)
      : withField(seo, `      keywords: ${list},`);
  }
  return entry.slice(0, open) + seo + entry.slice(close + 1);
}

/**
 * The file with one service changed, or null when it holds no such service.
 *
 * Fields the patch leaves out are left alone: a page's price, its packages,
 * its guarantee and its FAQs are the business's, not this app's.
 */
export function patchService(
  source: string,
  slug: string,
  patch: ServicePatch,
): string | null {
  const bounds = entryBounds(source, slug);
  if (!bounds) return null;
  let entry = source.slice(bounds.open, bounds.close + 1);

  if (patch.description !== undefined) {
    entry = DESCRIPTION_FIELD.test(entry)
      ? entry.replace(DESCRIPTION_FIELD, `$1${quoted(patch.description)}`)
      : withField(entry, `    description: ${quoted(patch.description)},`);
  }
  entry = patchSeo(entry, patch);
  if (patch.article !== undefined) {
    entry = ARTICLE_FIELD.test(entry)
      ? entry.replace(ARTICLE_FIELD, `$1${quoted(patch.article)}`)
      : withField(entry, `    article: ${quoted(patch.article)},`);
  }

  const patched =
    source.slice(0, bounds.open) + entry + source.slice(bounds.close + 1);
  return patch.article === undefined ? patched : withArticleDeclared(patched);
}

/**
 * The site is TypeScript, so a field the Service type has never heard of
 * fails its build. Declaring it here means the first article publish carries
 * its own type change rather than waiting on a hand edit.
 */
function withArticleDeclared(source: string) {
  if (/\barticle\?:\s*string/.test(source)) return source;
  const marker = source.search(/export interface Service\s*\{/);
  if (marker === -1) return source;
  const open = source.indexOf("{", marker);
  const close = closingBrace(source, open);
  if (close === -1) return source;
  const declaration = [
    "  /** Long-form body, written in Open SEO and rendered as HTML. */",
    "  article?: string;",
    "",
  ].join("\n");
  return `${source.slice(0, close)}${declaration}${source.slice(close)}`;
}

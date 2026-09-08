import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  countWords,
  readDraftImages,
  readNumber,
  readText,
  type Json,
} from "./read";

/** Below this a page tends to read thin to both a reader and a search engine. */
const THIN_CONTENT_WORDS = 700;

/**
 * Writers mark where an image goes with `![alt][IMAGE: brief]` or
 * `![alt](IMAGE: brief)`. Neither is a real image, so markdown renders the
 * whole thing as literal text in the middle of a paragraph. Split them out and
 * show them as what they are: a note about a picture nobody has made yet.
 */
const IMAGE_PLACEHOLDER =
  /!\[([^\]]*)\](?:\[IMAGE:([^\]]*)\]|\(IMAGE:([^)]*)\))/gi;

type Segment =
  | { kind: "markdown"; text: string }
  | { kind: "image"; alt: string; brief: string };

function splitBody(body: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  for (const match of body.matchAll(IMAGE_PLACEHOLDER)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({ kind: "markdown", text: body.slice(lastIndex, index) });
    }
    segments.push({
      kind: "image",
      alt: (match[1] ?? "").trim(),
      brief: (match[2] ?? match[3] ?? "").trim(),
    });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < body.length) {
    segments.push({ kind: "markdown", text: body.slice(lastIndex) });
  }
  return segments;
}

function ImageSlot({ alt, brief }: { alt: string; brief: string }) {
  return (
    <figure className="my-5 rounded-lg border border-dashed border-base-300 bg-base-200/40 p-4">
      <figcaption className="text-xs uppercase tracking-wide text-base-content/50">
        Image to add
      </figcaption>
      {alt ? <p className="mt-1 text-sm font-medium">{alt}</p> : null}
      {brief ? (
        <p className="mt-1 text-sm text-base-content/65">{brief}</p>
      ) : null}
    </figure>
  );
}

type Revision = { version: number; draft: unknown; createdAt: string };

/** Google truncates a title around here; past it the tail is invisible. */
const TITLE_LIMIT = 60;
/** And a description around here. */
const META_LIMIT = 155;

function LengthBar({
  label,
  value,
  limit,
}: {
  label: string;
  value: string;
  limit: number;
}) {
  const over = value.length > limit;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-base-content/55">{label}</span>
        <span className={over ? "text-warning" : "text-base-content/45"}>
          {value.length}/{limit}
        </span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-base-300">
        <div
          className={`h-full rounded-full ${over ? "bg-warning" : "bg-primary/50"}`}
          style={{ width: `${Math.min(100, (value.length / limit) * 100)}%` }}
        />
      </div>
    </div>
  );
}

/**
 * How the page is likely to appear in results.
 *
 * The reviewer is judging copy they will never see rendered anywhere else, so
 * showing the search listing is the closest thing to seeing the real thing.
 */
function SearchPreview({
  title,
  metaDescription,
  path,
}: {
  title: string | null;
  metaDescription: string | null;
  path: string | null;
}) {
  if (!title && !metaDescription) return null;
  return (
    <section className="rounded-xl border border-base-300 p-4">
      <p className="text-xs uppercase tracking-wide text-base-content/45">
        How this looks in Google
      </p>
      <div className="mt-3">
        {path ? (
          <p className="truncate text-xs text-base-content/50">{path}</p>
        ) : null}
        {title ? (
          <p className="mt-0.5 line-clamp-2 text-[15px] leading-snug text-[#1a0dab] dark:text-[#8ab4f8]">
            {title.length > TITLE_LIMIT
              ? `${title.slice(0, TITLE_LIMIT).trimEnd()}…`
              : title}
          </p>
        ) : null}
        {metaDescription ? (
          <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-base-content/65">
            {metaDescription.length > META_LIMIT
              ? `${metaDescription.slice(0, META_LIMIT).trimEnd()}…`
              : metaDescription}
          </p>
        ) : null}
      </div>
      <div className="mt-4 space-y-3">
        {title ? (
          <LengthBar label="Title" value={title} limit={TITLE_LIMIT} />
        ) : null}
        {metaDescription ? (
          <LengthBar
            label="Description"
            value={metaDescription}
            limit={META_LIMIT}
          />
        ) : null}
      </div>
    </section>
  );
}

function ImagePlan({ draft }: { draft: Json }) {
  const images = readDraftImages(draft);
  if (!images.length) return null;
  return (
    <section className="rounded-xl border border-base-300 p-4">
      <p className="text-xs uppercase tracking-wide text-base-content/45">
        Images
      </p>
      <div className="mt-3 space-y-3">
        {images.map((image, index) => (
          <div key={index} className="text-sm">
            {image.url ? (
              <img
                src={image.url}
                alt={image.alt ?? ""}
                className="mb-2 rounded"
              />
            ) : null}
            {image.placement ? (
              <p className="font-medium">{image.placement}</p>
            ) : null}
            {image.alt ? (
              <p className="text-base-content/65">{image.alt}</p>
            ) : null}
            {image.prompt && !image.url ? (
              <p className="mt-1 text-xs text-base-content/55">
                {image.prompt}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

export function DraftTab({
  draft,
  draftVersion,
  revisions,
  type,
  path,
}: {
  draft: Json;
  draftVersion: number;
  revisions: Revision[];
  type: string;
  path: string | null;
}) {
  const title = readText(draft, "title", "metaTitle");
  const metaDescription = readText(
    draft,
    "metaDescription",
    "meta_description",
    "description",
  );
  const body = readText(draft, "body", "content", "html");
  const stated = readNumber(draft, "wordCountEstimate", "wordCount");
  const words = body ? countWords(body) : (stated ?? 0);
  const thin = words > 0 && words < THIN_CONTENT_WORDS && type !== "product";

  if (!title && !metaDescription && !body) {
    return (
      <p className="py-8 text-center text-sm text-base-content/50">
        No draft yet.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-xs text-base-content/50">
        <span>Version {draftVersion}</span>
        {words ? <span>· {words.toLocaleString()} words</span> : null}
        {thin ? (
          <span className="badge badge-warning badge-sm">
            Short for a page like this
          </span>
        ) : null}
      </div>

      {/* Two columns on a wide screen: the page as it will be read on the
          left, and everything a reviewer checks it against on the right —
          which is what the empty half of the card is for. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <article className="min-w-0 rounded-xl border border-base-300 p-6">
          {title ? (
            <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          ) : null}
          {metaDescription ? (
            <p className="mt-2 text-sm text-base-content/60">
              {metaDescription}
            </p>
          ) : null}
          {body ? (
            <div className="optimization-draft-body mt-6">
              {splitBody(body).map((segment, index) =>
                segment.kind === "image" ? (
                  <ImageSlot
                    key={index}
                    alt={segment.alt}
                    brief={segment.brief}
                  />
                ) : (
                  <Markdown key={index} remarkPlugins={[remarkGfm]}>
                    {segment.text}
                  </Markdown>
                ),
              )}
            </div>
          ) : (
            <p className="mt-5 text-sm text-base-content/50">
              Only the title and description have been written so far.
            </p>
          )}
        </article>

        <aside className="space-y-4 lg:sticky lg:top-4">
          <SearchPreview
            title={title}
            metaDescription={metaDescription}
            path={path}
          />
          <ImagePlan draft={draft} />
          {revisions.length > 1 ? (
            <section className="rounded-xl border border-base-300 p-4">
              <p className="text-xs uppercase tracking-wide text-base-content/45">
                Earlier versions
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                {revisions.map((revision) => (
                  <li key={revision.version}>
                    <span className="font-medium">
                      Version {revision.version}
                    </span>
                    <span className="block truncate text-xs text-base-content/55">
                      {readText(revision.draft, "title") ?? "untitled"}
                    </span>
                    <span className="block text-xs text-base-content/45">
                      {revision.createdAt.slice(0, 10)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

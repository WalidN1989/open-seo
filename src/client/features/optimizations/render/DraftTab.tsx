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
const IMAGE_PLACEHOLDER = /!\[([^\]]*)\](?:\[IMAGE:([^\]]*)\]|\(IMAGE:([^)]*)\))/gi;

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

function ImagePlan({ draft }: { draft: Json }) {
  const images = readDraftImages(draft);
  if (!images.length) return null;
  return (
    <section>
      <h3 className="text-sm font-semibold">Images</h3>
      <div className="mt-2 space-y-3">
        {images.map((image, index) => (
          <div
            key={index}
            className="rounded-lg border border-base-300 p-3 text-sm"
          >
            {image.url ? (
              <img
                src={image.url}
                alt={image.alt ?? ""}
                className="mb-2 max-h-48 rounded"
              />
            ) : null}
            {image.placement ? (
              <p className="font-medium">{image.placement}</p>
            ) : null}
            {image.alt ? (
              <p className="text-base-content/70">
                <span className="text-base-content/50">Alt text: </span>
                {image.alt}
              </p>
            ) : null}
            {image.prompt && !image.url ? (
              <p className="mt-1 text-base-content/60">{image.prompt}</p>
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
}: {
  draft: Json;
  draftVersion: number;
  revisions: Revision[];
  type: string;
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

      {/* A preview of the finished page, laid out the way it will be read
          rather than the way it is stored. */}
      <article className="rounded-xl border border-base-300 p-5">
        {title ? (
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        ) : null}
        {metaDescription ? (
          <p className="mt-2 text-sm text-base-content/60">{metaDescription}</p>
        ) : null}
        {body ? (
          <div className="optimization-draft-body mt-5">
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

      <ImagePlan draft={draft} />

      {revisions.length > 1 ? (
        <section>
          <h3 className="text-sm font-semibold">Earlier versions</h3>
          <ul className="mt-2 space-y-1 text-sm text-base-content/70">
            {revisions.map((revision) => (
              <li key={revision.version}>
                Version {revision.version} ·{" "}
                {readText(revision.draft, "title") ?? "untitled"} ·{" "}
                {revision.createdAt.slice(0, 10)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

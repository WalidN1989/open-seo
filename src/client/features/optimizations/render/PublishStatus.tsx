import { ExternalLink, ImagePlus, Send } from "lucide-react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { serviceSlugFrom } from "@/shared/site-pages";
import { readDraftImages, readStringList, readText, type Json } from "./read";

/**
 * Where an approved article stands on its way to the site: ready to publish,
 * publishing, live (with the link), or failed (with WordPress's reason and a
 * retry).
 */
export function PublishStatus({
  status,
  type,
  targetUrl,
  approvedAt,
  publishError,
  cmsTarget,
  connected,
  kind,
  busy,
  error,
  onPublish,
  onAddImages,
}: {
  status: string;
  /** Only a blog post has a file of its own on a Lovable site. */
  type: string;
  /** Where this work is aimed, which is how a service page is recognised. */
  targetUrl: string | null;
  approvedAt: string | null;
  publishError: string | null;
  cmsTarget: Json;
  connected: boolean;
  kind: "lovable" | "wordpress" | null;
  busy: boolean;
  error: unknown;
  onPublish: () => void;
  /** Make the pictures for an article that went out without them. */
  onAddImages?: { run: () => void; busy: boolean; error: unknown };
}) {
  const url = readText(cmsTarget, "url");
  const lovable =
    kind === "lovable" || readText(cmsTarget, "kind") === "lovable";
  if (status === "published" && lovable) {
    return (
      <SentToLovable
        cmsTarget={cmsTarget}
        url={url}
        onAddImages={onAddImages}
      />
    );
  }
  if (status === "published") {
    return (
      <div className="alert alert-success">
        <span>
          Live on WordPress.{" "}
          {url ? (
            <a href={url} target="_blank" rel="noreferrer" className="link">
              Open the post <ExternalLink className="inline size-3.5" />
            </a>
          ) : null}
        </span>
      </div>
    );
  }
  if (status === "publishing") {
    return (
      <p className="flex items-center gap-2 text-sm text-base-content/70">
        <span className="loading loading-spinner loading-xs" />
        {lovable
          ? "Making the images and sending the article to Lovable — about a minute or two…"
          : "Publishing to WordPress…"}
      </p>
    );
  }
  if (status !== "approved" && status !== "failed") return null;
  // A Lovable site keeps each article as its own file and every service page
  // as one entry in a file the site shares. Both can be sent; anything else
  // is said here, before the button is pressed, not as a refusal afterwards.
  const service = type !== "blog" ? serviceSlugFrom(targetUrl) : null;
  const sendable = !lovable || type === "blog" || Boolean(service);
  return (
    <div className="space-y-3">
      <p className="text-sm text-base-content/70">
        Approved{approvedAt ? ` on ${approvedAt.slice(0, 10)}` : ""}.
      </p>
      {!sendable ? (
        <div className="alert alert-warning text-sm">
          <span>
            This is a {type === "page" ? "page" : type}, not a blog post, and
            its address is not a service page. Sending writes articles and
            service pages only. Copy the draft above into Lovable to put this
            one live.
          </span>
        </div>
      ) : null}
      {service ? (
        <div className="alert alert-info text-sm">
          <span>
            Updates the <strong>/services/{service}</strong> page: its search
            title, its description, its keywords, and the article below the
            page&rsquo;s existing sections. The price, the packages, the
            guarantee and the FAQs are left as they are.
          </span>
        </div>
      ) : null}
      {status === "failed" && publishError ? (
        <div className="alert alert-error text-sm">{publishError}</div>
      ) : null}
      {error ? (
        <div className="alert alert-error text-sm">
          {getStandardErrorMessage(error, "Publishing failed.")}
        </div>
      ) : null}
      {connected && sendable ? (
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={onPublish}
        >
          {busy ? (
            <span className="loading loading-spinner loading-xs" />
          ) : (
            <Send className="size-4" />
          )}
          {status === "failed"
            ? "Try publishing again"
            : lovable
              ? service
                ? "Update the service page"
                : "Send to Lovable"
              : "Publish to WordPress"}
        </button>
      ) : null}
    </div>
  );
}

/**
 * The article is committed to the site's repository and waiting in Lovable.
 * Nothing is live until someone clicks Publish there, and this says so
 * rather than claiming a publish that has not happened.
 */
function SentToLovable({
  cmsTarget,
  url,
  onAddImages,
}: {
  cmsTarget: Json;
  url: string | null;
  onAddImages?: { run: () => void; busy: boolean; error: unknown };
}) {
  const commitUrl = readText(cmsTarget, "commitUrl");
  const images = readDraftImages(cmsTarget);
  const skipped = readStringList(cmsTarget, "skippedImages").length > 0;
  // A service page has no pictures of its own to make: the page's images are
  // the site's, and this only edited its words.
  const article = readText(cmsTarget, "page") !== "service";
  return (
    <div className="space-y-3">
      <div className="alert alert-info text-sm">
        <span>
          Sent to your Lovable site. Open the project in Lovable and click{" "}
          <strong>Publish</strong> to put it live
          {url ? (
            <>
              {" "}
              at{" "}
              <a href={url} target="_blank" rel="noreferrer" className="link">
                {url.replace(/^https?:\/\//, "")}
              </a>
            </>
          ) : null}
          .
        </span>
      </div>
      {images.length ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {images.map((image) => (
            <figure
              key={image.url ?? image.alt}
              className="overflow-hidden rounded-lg border border-base-300"
            >
              {image.url ? (
                <img
                  src={image.url}
                  alt={image.alt ?? ""}
                  loading="lazy"
                  className="aspect-video w-full bg-base-200 object-cover"
                />
              ) : null}
              <figcaption className="p-2 text-xs text-base-content/60">
                {image.alt}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : null}
      {onAddImages && article && images.length === 0 ? (
        <div className="space-y-2 rounded-lg border border-base-300 p-3">
          <p className="text-sm">
            This article went out without pictures
            {readText(cmsTarget, "imageProblem")
              ? `: ${readText(cmsTarget, "imageProblem")}`
              : "."}
          </p>
          {onAddImages.error ? (
            <div className="alert alert-error text-sm">
              {getStandardErrorMessage(
                onAddImages.error,
                "The images could not be made.",
              )}
            </div>
          ) : null}
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={onAddImages.busy}
            onClick={onAddImages.run}
          >
            {onAddImages.busy ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <ImagePlus className="size-4" />
            )}
            Generate images for this post
          </button>
          <p className="text-xs text-base-content/50">
            It writes them into the same post, with alt text, and you publish
            again in Lovable.
          </p>
        </div>
      ) : null}
      <p className="text-xs text-base-content/50">
        Images show here once the site is published.
        {skipped
          ? " Some inline images could not be made and were left out."
          : ""}{" "}
        {commitUrl ? (
          <a href={commitUrl} target="_blank" rel="noreferrer" className="link">
            See the change <ExternalLink className="inline size-3" />
          </a>
        ) : null}
      </p>
    </div>
  );
}

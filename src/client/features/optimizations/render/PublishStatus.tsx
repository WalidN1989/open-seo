import { ExternalLink, Send } from "lucide-react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { readDraftImages, readStringList, readText, type Json } from "./read";

/**
 * Where an approved article stands on its way to the site: ready to publish,
 * publishing, live (with the link), or failed (with WordPress's reason and a
 * retry).
 */
export function PublishStatus({
  status,
  approvedAt,
  publishError,
  cmsTarget,
  connected,
  kind,
  busy,
  error,
  onPublish,
}: {
  status: string;
  approvedAt: string | null;
  publishError: string | null;
  cmsTarget: Json;
  connected: boolean;
  kind: "lovable" | "wordpress" | null;
  busy: boolean;
  error: unknown;
  onPublish: () => void;
}) {
  const url = readText(cmsTarget, "url");
  const lovable =
    kind === "lovable" || readText(cmsTarget, "kind") === "lovable";
  if (status === "published" && lovable) {
    return <SentToLovable cmsTarget={cmsTarget} url={url} />;
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
  return (
    <div className="space-y-3">
      <p className="text-sm text-base-content/70">
        Approved{approvedAt ? ` on ${approvedAt.slice(0, 10)}` : ""}.
      </p>
      {status === "failed" && publishError ? (
        <div className="alert alert-error text-sm">{publishError}</div>
      ) : null}
      {error ? (
        <div className="alert alert-error text-sm">
          {getStandardErrorMessage(error, "Publishing failed.")}
        </div>
      ) : null}
      {connected ? (
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
              ? "Send to Lovable"
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
}: {
  cmsTarget: Json;
  url: string | null;
}) {
  const commitUrl = readText(cmsTarget, "commitUrl");
  const images = readDraftImages(cmsTarget);
  const skipped = readStringList(cmsTarget, "skippedImages").length > 0;
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

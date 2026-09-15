import { ExternalLink, Send } from "lucide-react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { readText, type Json } from "./read";

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
  busy,
  error,
  onPublish,
}: {
  status: string;
  approvedAt: string | null;
  publishError: string | null;
  cmsTarget: Json;
  connected: boolean;
  busy: boolean;
  error: unknown;
  onPublish: () => void;
}) {
  const url = readText(cmsTarget, "url");
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
        <span className="loading loading-spinner loading-xs" /> Publishing to
        WordPress…
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
            : "Publish to WordPress"}
        </button>
      ) : null}
    </div>
  );
}

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

export type ThreadComment = {
  id: string;
  authorRole: string;
  authorUserId: string | null;
  authorName: string | null;
  kind: string;
  internal: boolean;
  body: string;
  createdAt: string;
};

/** "2 hours ago" reads better than a timestamp in a conversation. */
function relativeTime(iso: string, now: number): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.round((now - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return iso.slice(0, 10);
}

function displayName(comment: ThreadComment, viewerId: string | null): string {
  if (comment.authorRole === "agent") return "Open SEO";
  if (comment.authorUserId && comment.authorUserId === viewerId) return "You";
  return comment.authorName ?? "Open SEO";
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (name === "Open SEO") return "OS";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function SystemLine({ body }: { body: string }) {
  return (
    <li className="flex items-center gap-3 rounded-lg bg-base-200/50 px-4 py-2.5 text-sm text-base-content/65">
      <RefreshCw className="size-4 shrink-0 text-base-content/40" />
      {body}
    </li>
  );
}

function Message({
  comment,
  viewerId,
  now,
}: {
  comment: ThreadComment;
  viewerId: string | null;
  now: number;
}) {
  const name = displayName(comment, viewerId);
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold ${
          name === "Open SEO"
            ? "bg-primary/10 text-primary"
            : "bg-teal-600/10 text-teal-700"
        }`}
      >
        {initials(name)}
      </span>
      <div
        className={`min-w-0 flex-1 rounded-xl px-4 py-3 ${
          comment.internal
            ? "border border-dashed border-base-300 bg-base-200/40"
            : "bg-base-200/50"
        }`}
      >
        <p className="flex flex-wrap items-baseline gap-2 text-sm">
          <span className="font-semibold">{name}</span>
          <span className="text-xs text-base-content/45">
            {relativeTime(comment.createdAt, now)}
          </span>
          {comment.internal ? (
            <span className="badge badge-ghost badge-xs">Internal</span>
          ) : null}
        </p>
        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-base-content/80">
          {comment.body}
        </p>
      </div>
    </li>
  );
}

export function CommentsTab({
  comments,
  viewerId,
  canComment,
  now,
  busy,
  onComment,
  onRequestChanges,
  error,
}: {
  comments: ThreadComment[];
  viewerId: string | null;
  canComment: boolean;
  now: number;
  busy: boolean;
  onComment: (body: string) => void;
  onRequestChanges: (body: string) => void;
  error: unknown;
}) {
  const [body, setBody] = useState("");
  const text = body.trim();

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Comments</h2>
        <p className="mt-1 text-sm text-base-content/60">
          Ask for a change and we&rsquo;ll update the draft.
        </p>
      </div>

      {comments.length ? (
        <ul className="space-y-3">
          {comments.map((comment) =>
            comment.kind === "system" ? (
              <SystemLine key={comment.id} body={comment.body} />
            ) : (
              <Message
                key={comment.id}
                comment={comment}
                viewerId={viewerId}
                now={now}
              />
            ),
          )}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-base-300 py-10 text-center text-sm text-base-content/55">
          No comments yet. Ask for a change and we&rsquo;ll update the draft.
        </p>
      )}

      {canComment ? (
        <div className="space-y-3 border-t border-base-300 pt-5">
          <textarea
            className="textarea textarea-bordered w-full"
            rows={3}
            placeholder="What should we change?"
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <button
              className="btn btn-primary btn-sm"
              disabled={busy || !text}
              onClick={() => {
                onComment(text);
                setBody("");
              }}
            >
              Send
            </button>
            {/* Same box, two outcomes: a note that changes nothing, or a note
                that sends the draft back to be rewritten. */}
            <button
              className="btn btn-outline btn-sm"
              disabled={busy || !text}
              onClick={() => {
                onRequestChanges(text);
                setBody("");
              }}
            >
              Request changes
            </button>
          </div>
          <p className="text-xs text-base-content/45">
            Send leaves a note. Request changes sends the draft back to be
            rewritten.
          </p>
        </div>
      ) : (
        <p className="border-t border-base-300 pt-5 text-sm text-base-content/55">
          This opportunity is closed, so the thread is read-only.
        </p>
      )}

      {error ? (
        <p className="text-sm text-error">{getStandardErrorMessage(error)}</p>
      ) : null}
    </div>
  );
}

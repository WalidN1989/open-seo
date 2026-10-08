import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MARKDOWN_COMPONENTS } from "@/client/components/Markdown";
import { AI_ENGINE_LABELS } from "@/shared/ai-visibility";
import type { getAiVisibility } from "@/serverFunctions/ai-visibility";
type State = Awaited<ReturnType<typeof getAiVisibility>>;
const panel = "rounded-lg border border-base-300 bg-base-100 p-5";
const input =
  "w-full rounded-md border border-base-300 bg-base-100 px-3 py-2 text-sm";
export function AiVisibilityResults({
  state,
  selectedRun,
  onSelectRun,
}: {
  state: State;
  selectedRun?: string;
  onSelectRun: (id: string) => void;
}) {
  const details = state.details;
  const active = details && ["queued", "running"].includes(details.run.status);
  const answered =
    details?.answers.filter((a) => a.status === "completed" && a.answer) ?? [];
  const own = details?.brands.find((b) => b.isOwn);
  const ownMentions = answered.filter((a) =>
    a.mentions.some((m) => m.brandId === own?.id && m.mentioned),
  ).length;
  const ownCitations = answered.filter((a) =>
    a.mentions.some((m) => m.brandId === own?.id && m.cited),
  ).length;
  return (
    <section className={panel}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-semibold">Saved results</h2>
        <label className="flex items-center gap-2 text-sm">
          Check
          <select
            className={input}
            value={selectedRun ?? state.runs[0]?.id ?? ""}
            onChange={(e) => onSelectRun(e.target.value)}
            disabled={!state.runs.length}
          >
            {state.runs.map((r) => (
              <option key={r.id} value={r.id}>
                {new Date(r.createdAt).toLocaleString()} — {r.status}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!details && (
        <p className="mt-4 text-sm text-base-content/65">
          Your completed checks will appear here. No background schedule is
          enabled.
        </p>
      )}
      {details && (
        <div className="mt-4 space-y-4">
          <p className="text-sm">
            Status: <strong>{details.run.status}</strong> ·{" "}
            {
              details.answers.filter(
                (a) => a.status === "completed" || a.status === "failed",
              ).length
            }
            /{details.answers.length} checked
            {active &&
              " · Refresh results to see progress. Checks can take a few minutes."}
          </p>
          {answered.length > 0 && (
            <p className="text-sm">
              <strong>{own?.name}</strong> mentioned in {ownMentions}/
              {answered.length} returned answers · cited in {ownCitations}/
              {answered.length}. Failed checks and missing AI Overviews are
              excluded.
            </p>
          )}
          <p className="text-xs text-base-content/65">
            These are samples at a particular time and location, rather than
            every user's AI results. Select an earlier check to compare the
            captured answers.
          </p>
          {details.answers.map((a) => (
            <article
              key={a.id}
              className="rounded-md border border-base-300 p-4"
            >
              <div className="flex flex-wrap justify-between gap-3">
                <h3 className="text-sm font-semibold">
                  {AI_ENGINE_LABELS[a.engine]} · {a.prompt}
                </h3>
                <span className="text-xs text-base-content/65">
                  {a.status}
                  {a.collectedAt &&
                    ` · ${new Date(a.collectedAt).toLocaleString()}`}
                </span>
              </div>
              {a.status === "failed" && (
                <p className="mt-3 text-sm text-error">{a.error}</p>
              )}
              {a.status === "completed" && (
                <>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {a.answer &&
                      details.brands.map((b) => {
                        const match = a.mentions.find(
                          (m) => m.brandId === b.id,
                        );
                        return (
                          <span
                            key={b.id}
                            className="rounded bg-base-200 px-2 py-1 text-xs"
                          >
                            {b.name}:{" "}
                            {match?.mentioned ? "mentioned" : "no mention"}
                            {match?.cited ? " · cited" : ""}
                          </span>
                        );
                      })}
                  </div>
                  {!a.answer && (
                    <p className="mt-3 text-sm text-base-content/65">
                      {a.engine === "google_ai_overview"
                        ? "Google did not return an AI Overview for this question."
                        : "No answer was returned by this engine."}
                    </p>
                  )}
                  {a.answer && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm font-medium">
                        Captured answer
                      </summary>
                      <div className="mt-3 break-words text-sm">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={MARKDOWN_COMPONENTS}
                          disallowedElements={["img"]}
                          skipHtml
                        >
                          {a.answer}
                        </ReactMarkdown>
                      </div>
                    </details>
                  )}
                  {!!a.citations.length && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm font-medium">
                        Cited sources ({a.citations.length})
                      </summary>
                      <ul className="mt-2 space-y-2 text-sm">
                        {a.citations.map((c) => (
                          <li key={c.id}>
                            <a
                              className="break-all underline"
                              href={c.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {c.title || c.url}
                            </a>
                            <span className="ml-2 text-xs text-base-content/65">
                              {c.domain}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/client/components/Modal";
import { AiVisibilityResults } from "./AiVisibilityResults";
import { Link } from "@tanstack/react-router";
import {
  AI_ENGINES,
  AI_ENGINE_LABELS,
  type AiEngine,
} from "@/shared/ai-visibility";
import {
  getAiVisibility,
  saveAiVisibilitySettings,
  addAiVisibilityPrompt,
  archiveAiVisibilityPrompt,
  previewAiVisibilityRun,
  runAiVisibility,
} from "@/serverFunctions/ai-visibility";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

type State = Awaited<ReturnType<typeof getAiVisibility>>;
type Preview = Awaited<ReturnType<typeof previewAiVisibilityRun>>;
const button =
  "rounded-md border border-base-300 px-3 py-2 text-sm font-medium hover:bg-base-200 disabled:opacity-50";
const input =
  "w-full rounded-md border border-base-300 bg-base-100 px-3 py-2 text-sm";
const panel = "rounded-lg border border-base-300 bg-base-100 p-5";

export function AiVisibilityPage({ projectId }: { projectId: string }) {
  const [runId, setRunId] = useState<string>();
  const state = useQuery({
    queryKey: ["ai-visibility", projectId, runId],
    queryFn: () => getAiVisibility({ data: { projectId, runId } }),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  if (state.isPending) return <p className="p-6">Loading AI Visibility…</p>;
  if (state.isError)
    return (
      <div className="p-6" role="alert">
        {getStandardErrorMessage(state.error)}{" "}
        <button className={button} onClick={() => void state.refetch()}>
          Try again
        </button>
      </div>
    );
  return (
    <AiVisibilityView
      key={projectId}
      projectId={projectId}
      state={state.data}
      selectedRun={runId}
      onSelectRun={setRunId}
      onRefresh={() => state.refetch()}
      refreshing={state.isFetching}
    />
  );
}
function AiVisibilityView({
  projectId,
  state,
  selectedRun,
  onSelectRun,
  onRefresh,
  refreshing,
}: {
  projectId: string;
  state: State;
  selectedRun?: string;
  onSelectRun: (id?: string) => void;
  onRefresh: () => Promise<unknown>;
  refreshing: boolean;
}) {
  const queryClient = useQueryClient();
  const [brandName, setBrandName] = useState(
    state.settings?.brandName ?? state.project.name,
  );
  const [domain, setDomain] = useState(
    state.settings?.domain ?? state.project.domain ?? "",
  );
  const [engines, setEngines] = useState<AiEngine[]>(
    state.settings
      ? AI_ENGINES.filter((e) =>
          e === "google_ai_overview"
            ? state.settings?.googleAiOverview
            : state.settings?.[e],
        )
      : ["chatgpt", "gemini", "google_ai_overview"],
  );
  const [prompt, setPrompt] = useState("");
  const [preview, setPreview] = useState<{ plan: Preview; id: string }>();
  const [notice, setNotice] = useState("");
  const mutation = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["ai-visibility", projectId],
      });
    },
  });
  const active = state.runs.some(
    (r) => r.status === "queued" || r.status === "running",
  );
  const busy = mutation.isPending;
  const error = mutation.error ? getStandardErrorMessage(mutation.error) : null;
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">AI Visibility</h1>
          <p className="mt-2 text-sm text-base-content/65">
            Find out whether AI answers mention your brand and link to your
            website.
          </p>
          <p className="mt-1 text-sm text-base-content/65">
            Checks run only when you request them. Saving prompts and viewing
            history do not call DataForSEO.
          </p>
        </div>
        <button
          className={button}
          disabled={refreshing || busy}
          onClick={() => void onRefresh()}
        >
          Refresh results
        </button>
      </header>
      {error && (
        <p
          className="rounded-md border border-error p-3 text-sm text-error"
          role="alert"
        >
          {error}
        </p>
      )}
      {notice && (
        <p className="text-sm" role="status">
          {notice}
        </p>
      )}
      <section className={panel}>
        <h2 className="font-semibold">Your brand</h2>
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(async () => {
              await saveAiVisibilitySettings({
                data: { projectId, brandName, domain, engines },
              });
              setNotice("Brand and engines saved.");
            });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm">
              Brand name
              <input
                className={input}
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                required
                minLength={2}
                maxLength={120}
              />
            </label>
            <label className="space-y-2 text-sm">
              Website domain
              <input
                className={input}
                placeholder="example.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                required
                maxLength={253}
              />
            </label>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Engines</legend>
            <div className="flex flex-wrap gap-5">
              {AI_ENGINES.map((engine) => (
                <label key={engine} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={engines.includes(engine)}
                    onChange={(e) =>
                      setEngines((prev) =>
                        e.target.checked
                          ? [...prev, engine]
                          : prev.filter((v) => v !== engine),
                      )
                    }
                  />
                  {AI_ENGINE_LABELS[engine]}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="text-xs text-base-content/65">
            Uses this project's location and language. Competitors come from
            your{" "}
            <Link
              className="underline"
              to="/p/$projectId/settings/context"
              params={{ projectId }}
            >
              project context
            </Link>
            . ChatGPT and Gemini capture consumer search answers; Google
            captures AI Overviews when available.
          </p>
          <button className={button} disabled={busy || !engines.length}>
            Save brand and engines
          </button>
        </form>
      </section>
      <section className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">
            Prompts{" "}
            <span className="text-sm font-normal text-base-content/65">
              {state.prompts.length}/10
            </span>
          </h2>
          <button
            className={`${button} bg-primary text-primary-content hover:bg-primary/90`}
            disabled={
              busy || active || !state.settings || !state.prompts.length
            }
            onClick={() =>
              mutation.mutate(async () => {
                const plan = await previewAiVisibilityRun({
                  data: { projectId },
                });
                setPreview({ plan, id: crypto.randomUUID() });
              })
            }
          >
            {active ? "Check in progress" : "Run check"}
          </button>
        </div>
        <p className="mt-2 text-sm text-base-content/65">
          Use questions your customers might ask, such as “Which SEO tools are
          best for a small business?”
        </p>
        <form
          className="mt-4 flex gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(async () => {
              await addAiVisibilityPrompt({
                data: { projectId, text: prompt },
              });
              setPrompt("");
              setNotice("Prompt saved.");
            });
          }}
        >
          <label className="flex-1">
            <span className="sr-only">New prompt</span>
            <input
              className={input}
              placeholder="Add a question to track"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              minLength={3}
              maxLength={700}
              required
            />
          </label>
          <button
            className={button}
            disabled={busy || state.prompts.length >= 10}
          >
            Add prompt
          </button>
        </form>
        <ul className="mt-4 divide-y">
          {state.prompts.map((p) => (
            <li
              className="flex items-center justify-between gap-4 py-3 text-sm"
              key={p.id}
            >
              <span>{p.text}</span>
              <button
                className={button}
                disabled={busy}
                onClick={() =>
                  mutation.mutate(() =>
                    archiveAiVisibilityPrompt({
                      data: { projectId, promptId: p.id },
                    }),
                  )
                }
              >
                Archive<span className="sr-only"> {p.text}</span>
              </button>
            </li>
          ))}
        </ul>
        {!state.prompts.length && (
          <p className="mt-4 text-sm text-base-content/65">
            No prompts yet. Add one to get started.
          </p>
        )}
      </section>
      <AiVisibilityResults
        state={state}
        selectedRun={selectedRun}
        onSelectRun={onSelectRun}
      />
      {preview && (
        <Modal
          maxWidth="max-w-md"
          labelledBy="ai-run-title"
          onClose={busy ? undefined : () => setPreview(undefined)}
        >
          <h2 id="ai-run-title" className="text-lg font-semibold">
            Run this check?
          </h2>
          <p className="text-sm">
            {preview.plan.prompts.length} prompts across{" "}
            {preview.plan.engines.length} engines · {preview.plan.checks}{" "}
            answers.
          </p>
          <p className="text-sm">
            Estimated DataForSEO cost:{" "}
            <strong>${preview.plan.costUsd.toFixed(3)}</strong> for this check.
            No recurring checks.
          </p>
          <p className="text-xs text-base-content/65">
            Uses the saved brand and engines. Results can take several minutes.
            The provider's final charge may vary.
          </p>
          <div className="flex justify-end gap-3">
            <button
              autoFocus
              className={button}
              disabled={busy}
              onClick={() => setPreview(undefined)}
            >
              Cancel
            </button>
            <button
              className={`${button} bg-primary text-primary-content`}
              disabled={busy}
              onClick={() =>
                mutation.mutate(async () => {
                  const result = await runAiVisibility({
                    data: {
                      projectId,
                      runId: preview.id,
                      approval: preview.plan.approval,
                    },
                  });
                  onSelectRun(result.runId);
                  setPreview(undefined);
                  setNotice("Check started. Refresh results in a few minutes.");
                })
              }
            >
              {busy ? "Starting…" : "Confirm and run"}
            </button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-error">
              {error}
            </p>
          )}
        </Modal>
      )}
    </main>
  );
}

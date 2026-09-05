import { useState } from "react";
import { Lightbulb, MessageSquareText, Trash2 } from "lucide-react";
import {
  createWhatsappInstantAnswer,
  deleteWhatsappAskedQuestion,
  deleteWhatsappInstantAnswer,
  updateWhatsappAskedQuestion,
  updateWhatsappInstantAnswer,
} from "@/serverFunctions/whatsappAssistant";
import { ASKED_QUESTION_STATUSES } from "@/types/schemas/whatsappAssistant";
import {
  formatWhen,
  useAssistantConfig,
  useAssistantMutation,
} from "./assistantQuery";

function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <span className="loading loading-spinner" />
    </div>
  );
}

function Intro({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Lightbulb;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 rounded-xl border border-base-300 p-4">
      <Icon className="mt-0.5 size-5 shrink-0" />
      <div>
        <h3 className="font-medium">{title}</h3>
        <p className="text-sm text-base-content/60">{children}</p>
      </div>
    </div>
  );
}

export function InstantAnswersSection() {
  const query = useAssistantConfig();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const create = useAssistantMutation(
    (input: { question: string; answer: string }) =>
      createWhatsappInstantAnswer({ data: input }),
    "Instant answer added",
  );
  const update = useAssistantMutation(
    (input: { id: string; enabled: boolean }) =>
      updateWhatsappInstantAnswer({ data: input }),
    "Instant answer updated",
  );
  const remove = useAssistantMutation(
    (id: string) => deleteWhatsappInstantAnswer({ data: { id } }),
    "Instant answer removed",
  );
  if (query.isPending) return <Spinner />;
  if (!query.data) return null;
  return (
    <div className="grid max-w-3xl gap-4">
      <Intro icon={MessageSquareText} title="Instant answers">
        An incoming message matching one of these exactly (ignoring case and
        punctuation) gets the canned reply — no model call, no cost, no drift.
        Everything else falls through to the assistant. Use{" "}
        <code className="rounded bg-base-200 px-1">{"{{price:Name}}"}</code>{" "}
        instead of typing a price so answers follow the Commerce module.
      </Intro>
      <form
        className="grid gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate(
            { question, answer },
            {
              onSuccess: () => {
                setQuestion("");
                setAnswer("");
              },
            },
          );
        }}
      >
        <label className="form-control">
          <span className="mb-1 text-sm font-medium">Question</span>
          <input
            className="input input-bordered input-sm w-full"
            placeholder="Where are you based?"
            value={question}
            required
            onChange={(event) => setQuestion(event.currentTarget.value)}
          />
        </label>
        <label className="form-control">
          <span className="mb-1 text-sm font-medium">Answer</span>
          <textarea
            className="textarea textarea-bordered w-full text-sm"
            rows={3}
            placeholder="Oxley, Brisbane — with a delivery team in Colombo."
            value={answer}
            required
            onChange={(event) => setAnswer(event.currentTarget.value)}
          />
        </label>
        <div className="flex justify-end">
          <button
            className="btn btn-primary btn-sm"
            disabled={create.isPending}
          >
            Add
          </button>
        </div>
      </form>
      {query.data.instantAnswers.length ? (
        <ul className="grid gap-2">
          {query.data.instantAnswers.map((item) => (
            <li
              key={item.id}
              className="flex items-start justify-between gap-4 rounded-xl border border-base-300 p-4"
            >
              <div className="min-w-0">
                <p className="font-medium">{item.question}</p>
                <p className="whitespace-pre-wrap text-sm text-base-content/70">
                  {item.answer}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <input
                  type="checkbox"
                  className="toggle toggle-primary toggle-sm"
                  checked={item.enabled}
                  title={item.enabled ? "Enabled" : "Disabled"}
                  onChange={(event) =>
                    update.mutate({
                      id: item.id,
                      enabled: event.currentTarget.checked,
                    })
                  }
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  aria-label="Delete instant answer"
                  onClick={() => remove.mutate(item.id)}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="p-6 text-center text-sm text-base-content/60">
          No instant answers yet. Start with the three questions every customer
          asks.
        </p>
      )}
    </div>
  );
}

export function AskedQuestionsSection() {
  const query = useAssistantConfig();
  const [links, setLinks] = useState<Record<string, string>>({});
  const update = useAssistantMutation(
    (input: {
      id: string;
      blogUrl?: string | null;
      status?: (typeof ASKED_QUESTION_STATUSES)[number];
    }) => updateWhatsappAskedQuestion({ data: input }),
    "Question updated",
  );
  const remove = useAssistantMutation(
    (id: string) => deleteWhatsappAskedQuestion({ data: { id } }),
    "Question removed",
  );
  if (query.isPending) return <Spinner />;
  if (!query.data) return null;
  return (
    <div className="grid max-w-3xl gap-4">
      <Intro icon={Lightbulb} title="Questions people ask">
        Captured automatically from WhatsApp and ranked by how often they come
        up. Write a page for the common ones, save the URL here, and the
        assistant starts linking to it — short answer on WhatsApp, full detail
        on your site.
      </Intro>
      {query.data.askedQuestions.length ? (
        <ul className="grid gap-2">
          {query.data.askedQuestions.map((item) => (
            <li
              key={item.id}
              className="grid gap-3 rounded-xl border border-base-300 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{item.question}</p>
                  <p className="text-xs text-base-content/55">
                    asked {item.askCount}× · last {formatWhen(item.lastAskedAt)}
                  </p>
                </div>
                <span
                  className={`badge badge-sm ${item.status === "published" ? "badge-success" : item.status === "drafting" ? "badge-warning" : "badge-ghost"}`}
                >
                  {item.status}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className="input input-bordered input-sm min-w-60 flex-1"
                  placeholder="https://yoursite.com/blog/…"
                  value={links[item.id] ?? item.blogUrl ?? ""}
                  onChange={(event) =>
                    setLinks((current) => ({
                      ...current,
                      [item.id]: event.currentTarget.value,
                    }))
                  }
                />
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={update.isPending}
                  onClick={() =>
                    update.mutate({
                      id: item.id,
                      blogUrl: links[item.id] ?? item.blogUrl ?? "",
                    })
                  }
                >
                  Save link
                </button>
                <select
                  className="select select-bordered select-sm"
                  value={item.status}
                  onChange={(event) => {
                    const status = ASKED_QUESTION_STATUSES.find(
                      (candidate) => candidate === event.currentTarget.value,
                    );
                    if (status) update.mutate({ id: item.id, status });
                  }}
                >
                  {ASKED_QUESTION_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  aria-label="Delete question"
                  onClick={() => remove.mutate(item.id)}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="p-6 text-center text-sm text-base-content/60">
          Nothing captured yet. Questions appear here as customers ask them.
        </p>
      )}
    </div>
  );
}

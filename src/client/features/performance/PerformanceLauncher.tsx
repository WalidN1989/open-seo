import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowUp, MessageCircle, X } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { isUserAuthMode } from "@/lib/auth-mode";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { askPerformanceQuestion } from "@/serverFunctions/performance";
import { RecordList, Signals } from "./PerformanceParts";

export function PerformanceLauncher() {
  const { data: session } = useSession();
  if (isUserAuthMode(import.meta.env.AUTH_MODE) && !session?.user) return null;
  return (
    <QuickQuestion
      key={`${session?.user.id}:${session?.session.activeOrganizationId}`}
    />
  );
}

function QuickQuestion() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const answer = useMutation({
    mutationFn: () => askPerformanceQuestion({ data: { question } }),
    retry: false,
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      if (event.code === "Space" && !isTyping && !open) {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);
  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Performance chat"
          className="fixed inset-0 z-50 flex items-center justify-center bg-base-300/55 p-3 backdrop-blur-md sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="flex h-full max-h-[54rem] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-base-100/70 bg-base-100/95 shadow-2xl">
            <header className="flex items-center justify-between border-b border-base-300/70 px-5 py-4 sm:px-8">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-2xl bg-primary text-primary-content shadow-sm">
                  <MessageCircle className="size-5" />
                </span>
                <div>
                  <h2 className="text-lg font-semibold">Ask Performance</h2>
                  <p className="text-xs text-base-content/55">
                    All authorized projects
                  </p>
                </div>
              </div>
              <button
                className="btn btn-square btn-ghost btn-sm rounded-full"
                aria-label="Close performance chat"
                onClick={() => setOpen(false)}
              >
                <X className="size-5" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto px-5 py-8 sm:px-10">
              {!answer.data && !answer.isPending && (
                <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center text-center">
                  <span className="mb-5 grid size-16 place-items-center rounded-3xl bg-primary/10 text-primary">
                    <MessageCircle className="size-8" />
                  </span>
                  <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                    What would you like to know?
                  </h3>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-base-content/60">
                    Ask about project activity, messages, attention items, or
                    engineering checks.
                  </p>
                </div>
              )}
              {answer.isPending && (
                <div
                  className="flex h-full items-center justify-center"
                  role="status"
                >
                  <span className="loading loading-dots loading-lg text-primary" />
                </div>
              )}
              {answer.data && (
                <div className="mx-auto max-w-3xl space-y-5" aria-live="polite">
                  <p className="whitespace-pre-line text-lg leading-8">
                    {answer.data.text}
                  </p>
                  <p className="text-xs text-base-content/50">
                    Checked {new Date(answer.data.observedAt).toLocaleString()}
                  </p>
                  <div className="overflow-hidden rounded-2xl border border-base-300">
                    <RecordList records={answer.data.sources} />
                  </div>
                  <Signals signals={answer.data.signals} />
                </div>
              )}
              {answer.isError && (
                <p
                  role="alert"
                  className="alert alert-error mx-auto max-w-2xl text-sm"
                >
                  {getStandardErrorMessage(
                    answer.error,
                    "Could not answer. Try again later.",
                  )}
                </p>
              )}
            </div>
            <form
              className="border-t border-base-300/70 bg-base-200/60 p-4 sm:p-6"
              onSubmit={(event) => {
                event.preventDefault();
                if (question.trim() && !answer.isPending) answer.mutate();
              }}
            >
              <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-base-300 bg-base-100 p-2 shadow-sm focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10">
                <textarea
                  autoFocus
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      if (question.trim() && !answer.isPending) answer.mutate();
                    }
                  }}
                  maxLength={500}
                  rows={2}
                  className="textarea min-h-14 flex-1 resize-none border-0 bg-transparent text-base focus:outline-none"
                  placeholder="Ask what needs your attention…"
                  aria-label="Message Jev"
                />
                <button
                  type="submit"
                  className="btn btn-circle btn-primary"
                  aria-label="Send question"
                  disabled={answer.isPending || !question.trim()}
                >
                  <ArrowUp className="size-5" />
                </button>
              </div>
              <p className="mt-2 text-center text-xs text-base-content/45">
                Enter to send · Shift + Enter for a new line · Esc to close
              </p>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

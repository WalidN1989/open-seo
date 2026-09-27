import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MessageCircle, X } from "lucide-react";
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
      if (
        event.key.toLowerCase() === "j" &&
        event.shiftKey &&
        (event.ctrlKey || event.metaKey)
      ) {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      <button
        className="btn btn-sm fixed bottom-4 left-4 z-30 shadow md:left-64"
        aria-label="Quick performance question"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <MessageCircle className="size-4" /> Quick question
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Quick performance question"
          className="fixed bottom-16 left-3 right-3 z-40 max-h-[75vh] overflow-auto rounded-xl border border-base-300 bg-base-100 shadow-xl sm:left-auto sm:right-5 sm:w-[28rem]"
        >
          <div className="flex items-center justify-between border-b border-base-300 p-4">
            <h2 className="font-semibold">Ask Performance</h2>
            <button
              className="btn btn-square btn-ghost btn-xs"
              aria-label="Close quick question"
              onClick={() => setOpen(false)}
            >
              <X className="size-4" />
            </button>
          </div>
          <form
            className="space-y-3 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (question.trim() && !answer.isPending) answer.mutate();
            }}
          >
            <p className="text-xs text-base-content/65">
              All authorized projects. Ask about project count, WhatsApp, latest
              email, attention items, or engineering checks.
            </p>
            <label className="block text-sm">
              Your question
              <input
                autoFocus
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                maxLength={500}
                className="input input-bordered mt-2 w-full"
                placeholder="What needs my attention?"
              />
            </label>
            <p className="text-xs text-base-content/50">
              Your question goes to TypeSafe. Keep customer details and secrets
              out.
            </p>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={answer.isPending || !question.trim()}
            >
              {answer.isPending ? "Checking…" : "Ask Jev"}
            </button>
            {answer.isError && (
              <p role="alert" className="text-sm text-error">
                {getStandardErrorMessage(
                  answer.error,
                  "Could not answer. Try again later.",
                )}
              </p>
            )}
          </form>
          {answer.data && (
            <div aria-live="polite">
              <p className="whitespace-pre-line px-4 text-sm">
                {answer.data.text}
              </p>
              <p className="p-4 text-xs text-base-content/50">
                Checked {new Date(answer.data.observedAt).toLocaleString()}
              </p>
              <RecordList records={answer.data.sources} />
              <div className="p-3">
                <Signals signals={answer.data.signals} />
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

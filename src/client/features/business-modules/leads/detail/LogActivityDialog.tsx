import { useState } from "react";
import { AlarmClock, X } from "lucide-react";
import { Modal } from "@/client/components/Modal";
import {
  ACTIVITY_KIND_META,
  LOGGABLE_KINDS,
  OUTCOME_META,
  PICKABLE_OUTCOMES,
  type ActivityKind,
} from "@/shared/lead-journal";
import { isoDate, localMoment, type LogActivityInput } from "./useLeadDetail";

type Props = {
  saving: boolean;
  onClose: () => void;
  onSave: (input: Omit<LogActivityInput, "leadId">) => void;
};

const MAX = 2000;
const QUICK_DAYS = [
  { label: "Tomorrow", days: 1 },
  { label: "+3d", days: 3 },
  { label: "+1w", days: 7 },
];

const microLabel =
  "text-[10px] font-semibold uppercase tracking-wider text-base-content/50";

export function LogActivityDialog({ saving, onClose, onSave }: Props) {
  const [kind, setKind] = useState<ActivityKind>("call");
  const [notes, setNotes] = useState("");
  const [outcome, setOutcome] = useState<LogActivityInput["outcome"]>();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [nextAction, setNextAction] = useState("");

  const canSave = notes.trim().length > 0 && !saving;
  const submit = () => {
    if (!canSave) return;
    onSave({
      activityType: kind,
      notes: notes.trim(),
      outcome,
      nextActionDue: date ? localMoment(date, time) : undefined,
      nextAction: date && nextAction.trim() ? nextAction.trim() : undefined,
      remind: Boolean(date && time),
    });
  };

  return (
    <Modal maxWidth="max-w-3xl" onClose={onClose} labelledBy="log-activity">
      <div
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            submit();
          }
        }}
        className="space-y-4"
      >
        <div>
          <h2 id="log-activity" className="text-lg font-bold">
            Log an activity
          </h2>
          <p className="text-sm text-base-content/60">
            Capture what happened, the outcome, and when to follow up.
          </p>
        </div>

        <div>
          <div className={microLabel}>Activity type</div>
          <div className="mt-1.5 grid grid-cols-4 gap-2 sm:grid-cols-7">
            {LOGGABLE_KINDS.map((key) => {
              const meta = ACTIVITY_KIND_META[key];
              const selected = kind === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setKind(key)}
                  className={`flex flex-col items-center gap-1 rounded-xl border py-2.5 text-xs transition ${
                    selected
                      ? "border-primary bg-primary/10 font-semibold shadow-sm ring-1 ring-primary/40"
                      : "border-base-300 hover:bg-base-200"
                  }`}
                >
                  <span
                    className={`grid size-7 place-items-center rounded-full ${meta.tint}`}
                  >
                    {meta.emoji}
                  </span>
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className={microLabel}>What happened?</div>
            <textarea
              autoFocus
              rows={7}
              maxLength={MAX}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="e.g. Called Iftikhar, wants a quote for the 5-page website before month end."
              className="textarea textarea-bordered mt-1.5 w-full resize-y text-sm leading-relaxed"
            />
            <div className="text-right text-[10px] text-base-content/45">
              {notes.length}/{MAX}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className={microLabel}>
                Outcome <span className="normal-case">(optional)</span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {PICKABLE_OUTCOMES.map((key) => {
                  const meta = OUTCOME_META[key];
                  const selected = outcome === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setOutcome(selected ? undefined : key)}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        selected
                          ? `${meta.className} shadow-sm ring-1 ring-primary/30`
                          : "bg-base-200 text-base-content/60 hover:bg-base-300"
                      }`}
                    >
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg border border-base-300 bg-base-200/40 p-3">
              <div className={microLabel}>
                Schedule next follow-up{" "}
                <span className="normal-case">(optional)</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className="input input-bordered input-sm w-[9.5rem]"
                />
                <input
                  type="time"
                  value={time}
                  disabled={!date}
                  onChange={(event) => setTime(event.target.value)}
                  className="input input-bordered input-sm w-28"
                />
                {date ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs btn-square"
                    aria-label="Clear follow-up"
                    onClick={() => {
                      setDate("");
                      setTime("");
                    }}
                  >
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </div>
              <div className="mt-2 flex gap-1.5">
                {QUICK_DAYS.map((quick) => (
                  <button
                    key={quick.label}
                    type="button"
                    className="btn btn-outline btn-xs"
                    onClick={() => setDate(isoDate(quick.days))}
                  >
                    {quick.label}
                  </button>
                ))}
              </div>
              {date ? (
                <div className="mt-2 space-y-1.5">
                  <input
                    value={nextAction}
                    maxLength={300}
                    onChange={(event) => setNextAction(event.target.value)}
                    placeholder="What's the next action?"
                    className="input input-bordered input-sm w-full"
                  />
                  <div className="text-[11px] text-base-content/55">
                    {new Date(`${date}T12:00`).toLocaleDateString("en-AU", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })}
                  </div>
                  {time ? (
                    <div className="flex items-center gap-1 text-[11px] text-primary">
                      <AlarmClock className="size-3" />
                      You&apos;ll get a reminder at this time.
                    </div>
                  ) : (
                    <div className="text-[11px] text-base-content/45">
                      Add a time to get a reminder popup.
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-base-content/45">
            <kbd className="kbd kbd-xs">Ctrl</kbd> +{" "}
            <kbd className="kbd kbd-xs">Enter</kbd> to save
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!canSave}
              onClick={submit}
            >
              {saving ? (
                <span className="loading loading-spinner loading-xs" />
              ) : null}
              Log Activity
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

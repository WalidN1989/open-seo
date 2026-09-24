import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AlarmClock, Building2, Check, Clock } from "lucide-react";
import { whenLabel } from "@/shared/lead-journal";
import { isDue, useNow, useReminders, type Reminder } from "./useReminders";

// Page-lifetime memory survives route remounts and resets on a full refresh.
// Reminder IDs are globally unique; keep no reminder content here.
const popped = new Set<string>();

const SNOOZE_OPTIONS = [
  { label: "10 min", minutes: 10 },
  { label: "1 hour", minutes: 60 },
  { label: "Tomorrow", minutes: 60 * 24 },
];

/**
 * The reminder that falls due while you work: centred, one at a time, and
 * never twice in a session. Clicking outside leaves it in the bell.
 */
export function ReminderPopup() {
  const { reminders, snooze, done } = useReminders();
  const now = useNow();
  const navigate = useNavigate();
  const [current, setCurrent] = useState<Reminder | null>(null);
  const [snoozing, setSnoozing] = useState(false);

  useEffect(() => {
    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "default"
    ) {
      void Notification.requestPermission().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (current) return;
    const next = reminders.find(
      (reminder) => isDue(reminder, now) && !popped.has(reminder.id),
    );
    if (!next) return;
    popped.add(next.id);
    setCurrent(next);
    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      try {
        const shown = new Notification(`Reminder: ${next.title}`, {
          body: [next.label, whenLabel(next.remindAt)]
            .filter(Boolean)
            .join(" · "),
        });
        shown.addEventListener("click", () => window.focus());
      } catch {
        // Some browsers only allow notifications from a service worker.
      }
    }
  }, [reminders, now, current]);

  if (!current) return null;
  const close = () => {
    setCurrent(null);
    setSnoozing(false);
  };
  const dismissAll = () => {
    for (const reminder of reminders) {
      if (isDue(reminder, Date.now())) popped.add(reminder.id);
    }
    close();
  };
  const open = () => {
    if (current.leadId) {
      void navigate({
        to: "/modules/leads/$leadId",
        params: { leadId: current.leadId },
      });
    }
    close();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-base-100/40 p-4 backdrop-blur-sm"
      onClick={close}
    >
      <div
        role="alertdialog"
        aria-labelledby="reminder-title"
        className="w-full max-w-md rounded-2xl border border-base-300 bg-base-100 p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex flex-col items-center text-center">
          <div className="mb-3 grid size-14 place-items-center rounded-full bg-primary/10 text-primary">
            <AlarmClock className="size-7" />
          </div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-base-content/50">
            Reminder
          </div>
          <h2 id="reminder-title" className="mt-0.5 text-xl font-bold">
            {current.title}
          </h2>
          <div className="mt-1 flex items-center gap-1.5 text-sm text-base-content/55">
            <Clock className="size-3.5" />
            {whenLabel(current.remindAt)}
          </div>
        </div>

        {current.label || current.note ? (
          <div className="mb-5 space-y-2 rounded-xl border border-base-300 bg-base-200/50 p-3 text-sm">
            {current.label ? (
              <button
                type="button"
                onClick={open}
                className="flex w-full items-center gap-2 font-medium text-primary hover:underline"
              >
                <Building2 className="size-4 shrink-0" />
                <span className="truncate">{current.label}</span>
              </button>
            ) : null}
            {current.note ? (
              <p className="text-base-content/60">{current.note}</p>
            ) : null}
          </div>
        ) : null}

        {snoozing ? (
          <div className="grid grid-cols-3 gap-2">
            {SNOOZE_OPTIONS.map((option) => (
              <button
                key={option.minutes}
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => {
                  snooze.mutate({ id: current.id, minutes: option.minutes });
                  close();
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setSnoozing(true)}
            >
              <AlarmClock className="size-4" />
              Snooze
            </button>
            <button
              type="button"
              className="btn btn-neutral btn-sm"
              onClick={open}
            >
              Open
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => {
                done.mutate(current.id);
                close();
              }}
            >
              <Check className="size-4" />
              Done
            </button>
          </div>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-sm mt-3 w-full"
          onClick={dismissAll}
        >
          Dismiss all
        </button>
        <p className="mt-2 text-center text-[11px] text-base-content/50">
          Dismissed reminders stay in the bell
        </p>
      </div>
    </div>
  );
}

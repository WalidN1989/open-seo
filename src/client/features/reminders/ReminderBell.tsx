import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bell, BellRing, Check, Clock, Flame, Trash2 } from "lucide-react";
import {
  isDue,
  relative,
  useNow,
  useReminders,
  type Reminder,
} from "./useReminders";

/** The bell: what's due now, what's coming, and the last few done. */
export function ReminderBell({ onNavigate }: { onNavigate?: () => void }) {
  const { reminders, snooze, done, remove } = useReminders();
  const now = useNow();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (!root.current?.contains(target)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  const due = reminders.filter((reminder) => isDue(reminder, now));
  const upcoming = reminders.filter(
    (reminder) => reminder.status === "pending" && !isDue(reminder, now),
  );
  const finished = reminders
    .filter((reminder) => reminder.status === "done")
    .slice(-5)
    .toReversed();

  const go = (reminder: Reminder) => {
    if (!reminder.leadId) return;
    setOpen(false);
    onNavigate?.();
    void navigate({
      to: "/modules/leads/$leadId",
      params: { leadId: reminder.leadId },
    });
  };

  const groups = [
    { label: "Due now", items: due, tone: "text-rose-600" },
    { label: "Upcoming", items: upcoming, tone: "" },
    { label: "Done", items: finished, tone: "" },
  ].filter((group) => group.items.length > 0);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label={`Reminders${due.length ? `, ${due.length} due` : ""}`}
        onClick={() => setOpen((value) => !value)}
        className="relative grid size-8 place-items-center rounded-full text-base-content/60 hover:bg-base-300 hover:text-base-content"
      >
        {due.length ? (
          <BellRing className="size-[18px] text-base-content" />
        ) : (
          <Bell className="size-[18px]" />
        )}
        {due.length ? (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-base-200">
            {due.length > 99 ? "99+" : due.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="fixed left-3 top-14 z-[60] w-[360px] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-xl">
          <div className="flex items-center justify-between border-b border-base-300 px-3 py-2.5">
            <span className="text-sm font-semibold">Reminders</span>
            <span className="rounded-full bg-base-200 px-2 py-0.5 text-xs text-base-content/60">
              {due.length + upcoming.length} pending
            </span>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {groups.length === 0 ? (
              <div className="px-3 py-10 text-center text-sm text-base-content/50">
                You&apos;re all caught up.
              </div>
            ) : (
              groups.map((group) => (
                <div key={group.label}>
                  <div
                    className={`sticky top-0 z-10 bg-base-100/95 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-base-content/50 backdrop-blur ${group.tone}`}
                  >
                    {group.label}
                  </div>
                  {group.items.map((reminder) => (
                    <BellItem
                      key={reminder.id}
                      reminder={reminder}
                      now={now}
                      onOpen={() => go(reminder)}
                      onSnooze={() =>
                        snooze.mutate({ id: reminder.id, minutes: 60 })
                      }
                      onDone={() => done.mutate(reminder.id)}
                      onDelete={() => remove.mutate(reminder.id)}
                    />
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function stop(action: () => void) {
  return (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    action();
  };
}

function BellItem({
  reminder,
  now,
  onOpen,
  onSnooze,
  onDone,
  onDelete,
}: {
  reminder: Reminder;
  now: number;
  onOpen: () => void;
  onSnooze: () => void;
  onDone: () => void;
  onDelete: () => void;
}) {
  const finished = reminder.status === "done";
  const overdue = isDue(reminder, now);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => (event.key === "Enter" ? onOpen() : undefined)}
      className={`group flex cursor-pointer gap-2.5 border-b border-base-200 px-3 py-2.5 hover:bg-base-200/60 ${
        finished ? "opacity-60" : ""
      }`}
    >
      {reminder.leadId ? (
        <Flame className="mt-0.5 size-4 shrink-0 text-orange-500" />
      ) : (
        <Clock className="mt-0.5 size-4 shrink-0 text-base-content/50" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <span
            className={`flex-1 text-sm font-medium ${finished ? "line-through" : ""}`}
          >
            {reminder.title}
          </span>
          <span
            className={`shrink-0 text-[11px] ${
              overdue ? "font-semibold text-rose-600" : "text-base-content/50"
            }`}
          >
            {relative(reminder.remindAt, now)}
          </span>
        </div>
        {reminder.label ? (
          <div className="truncate text-xs text-base-content/55">
            {reminder.label}
          </div>
        ) : null}
        <div className="mt-1 hidden items-center gap-1 group-hover:flex">
          {finished ? null : (
            <>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={stop(onSnooze)}
              >
                1h
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={stop(onDone)}
              >
                <Check className="size-3" /> Done
              </button>
            </>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-xs text-error"
            aria-label="Delete reminder"
            onClick={stop(onDelete)}
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

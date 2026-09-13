import { useState } from "react";
import { AlarmClock, CalendarClock, Flag, Sparkles } from "lucide-react";
import { PRIORITY_META, type LeadPriority } from "@/shared/leads-command";
import {
  FOLLOW_UP_TONE_CLASS,
  followUpDue,
  followUpRecommendation,
  whenLabel,
} from "@/shared/lead-journal";
import { isoDate, localMoment, type LeadDetail } from "./useLeadDetail";

type Props = {
  detail: LeadDetail;
  lastContactAt: string | null;
  saving: boolean;
  onSave: (changes: {
    nextActionDue: string;
    nextAction?: string;
    priority?: LeadPriority;
  }) => void;
  onRemind: (input: { title: string; remindAt: string }) => void;
};

const QUICK = [
  { label: "Today", days: 0 },
  { label: "Tomorrow", days: 1 },
  { label: "+3d", days: 3 },
  { label: "+1w", days: 7 },
];

export function FollowUpCard({
  detail,
  lastContactAt,
  saving,
  onSave,
  onRemind,
}: Props) {
  const { lead } = detail;
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [action, setAction] = useState(lead.nextAction ?? "");
  const [priority, setPriority] = useState<LeadPriority>(lead.priority);
  const closed = lead.status === "won" || lead.status === "lost";
  const due = lead.nextActionDue ? followUpDue(lead.nextActionDue) : null;
  const pending = detail.reminders[0] ?? null;
  const nudge = followUpRecommendation({
    status: lead.status,
    nextActionDue: lead.nextActionDue,
    lastContactAt,
  });

  const save = () => {
    if (!date) return;
    const remindAt = localMoment(date, time);
    onSave({
      nextActionDue: remindAt,
      nextAction: action.trim() || undefined,
      priority,
    });
    if (time) {
      onRemind({
        title:
          action.trim() || `Follow up — ${detail.company?.name ?? lead.title}`,
        remindAt,
      });
    }
    setEditing(false);
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-base-300 bg-base-100 p-4">
        <div className="flex items-center gap-2">
          <CalendarClock className="size-4 text-base-content/60" />
          <h3 className="text-sm font-bold">Next Follow-up</h3>
          {closed ? null : (
            <button
              type="button"
              className="link link-hover ml-auto text-xs text-base-content/60"
              onClick={() => setEditing((value) => !value)}
            >
              {editing ? "Done" : "Edit"}
            </button>
          )}
        </div>

        {closed ? (
          <p className="mt-2 text-sm text-base-content/55">
            Lead is {lead.status}; no follow-up needed.
          </p>
        ) : editing ? (
          <div className="mt-3 space-y-2">
            <div className="flex gap-2">
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="input input-bordered input-sm flex-1"
              />
              <input
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
                className="input input-bordered input-sm w-28"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {QUICK.map((quick) => (
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
            <input
              value={action}
              maxLength={300}
              onChange={(event) => setAction(event.target.value)}
              placeholder="Next action, e.g. Send the website quote"
              className="input input-bordered input-sm w-full"
            />
            <div className="join w-full">
              {(["urgent", "high", "medium", "low"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPriority(key)}
                  className={`btn join-item btn-xs flex-1 ${
                    priority === key ? "btn-active" : ""
                  }`}
                >
                  {PRIORITY_META[key].label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm w-full"
              disabled={!date || saving}
              onClick={save}
            >
              Save follow-up{time ? " + reminder" : ""}
            </button>
          </div>
        ) : lead.nextActionDue && due ? (
          <div className="mt-2">
            <div className="text-2xl font-bold">
              {new Date(lead.nextActionDue).toLocaleDateString("en-AU", {
                day: "numeric",
                month: "long",
              })}
            </div>
            <div className="text-sm text-base-content/60">
              {new Date(lead.nextActionDue).toLocaleDateString("en-AU", {
                weekday: "long",
              })}
            </div>
            <div className={`mt-1 text-xs ${FOLLOW_UP_TONE_CLASS[due.tone]}`}>
              {due.label}
            </div>
            {lead.nextAction ? (
              <p className="mt-2 text-sm">{lead.nextAction}</p>
            ) : null}
            <div className="mt-2 flex items-center gap-1 text-xs text-base-content/60">
              <Flag className="size-3" />
              {PRIORITY_META[lead.priority].label} priority
            </div>
          </div>
        ) : (
          <div className="mt-2">
            <p className="text-sm text-base-content/55">
              No follow-up scheduled.
            </p>
            <button
              type="button"
              className="btn btn-outline btn-sm mt-2 w-full"
              onClick={() => setEditing(true)}
            >
              Schedule follow-up
            </button>
          </div>
        )}

        {pending && !editing ? (
          <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-primary/5 px-2 py-1.5 text-xs text-primary">
            <AlarmClock className="size-3.5" />
            Reminder {whenLabel(pending.remindAt)}
          </div>
        ) : null}
      </div>

      {nudge ? (
        <div
          className={`flex items-center gap-2 rounded-xl border p-3 text-sm font-medium ${nudge.className}`}
        >
          <Sparkles className="size-4 shrink-0" />
          {nudge.headline}
        </div>
      ) : null}
    </div>
  );
}

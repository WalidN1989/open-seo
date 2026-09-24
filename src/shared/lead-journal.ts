/**
 * How the lead page names and colours what happened: activity kinds,
 * outcomes, temperatures, day headings and the follow-up nudge. Shared so the
 * leads table, the journal and the reminder popup all say the same thing.
 */

export type ActivityKind =
  | "call"
  | "whatsapp"
  | "sms"
  | "meeting"
  | "email"
  | "visit"
  | "note"
  | "quotation"
  | "task";

export const ACTIVITY_KIND_META: Record<
  ActivityKind,
  { label: string; emoji: string; tint: string }
> = {
  call: { label: "Call", emoji: "📞", tint: "bg-sky-100 text-sky-700" },
  whatsapp: {
    label: "WhatsApp",
    emoji: "💬",
    tint: "bg-emerald-100 text-emerald-700",
  },
  sms: { label: "SMS", emoji: "📱", tint: "bg-indigo-100 text-indigo-700" },
  meeting: {
    label: "Meeting",
    emoji: "🤝",
    tint: "bg-violet-100 text-violet-700",
  },
  email: { label: "Email", emoji: "📧", tint: "bg-amber-100 text-amber-700" },
  visit: {
    label: "Site visit",
    emoji: "📍",
    tint: "bg-rose-100 text-rose-700",
  },
  note: { label: "Note", emoji: "📝", tint: "bg-slate-100 text-slate-700" },
  quotation: {
    label: "Quotation",
    emoji: "📄",
    tint: "bg-teal-100 text-teal-700",
  },
  task: { label: "Task", emoji: "✅", tint: "bg-slate-100 text-slate-700" },
};

/** The kinds a person logs by hand, in the order the dialog shows them. */
export const LOGGABLE_KINDS: ActivityKind[] = [
  "call",
  "whatsapp",
  "sms",
  "meeting",
  "email",
  "visit",
  "note",
  "quotation",
];

function isActivityKind(kind: string): kind is ActivityKind {
  return Object.hasOwn(ACTIVITY_KIND_META, kind);
}

export function kindMeta(kind: string) {
  return isActivityKind(kind)
    ? ACTIVITY_KIND_META[kind]
    : ACTIVITY_KIND_META.note;
}

export const OUTCOME_META: Record<
  string,
  { label: string; className: string }
> = {
  interested: {
    label: "Interested",
    className: "bg-emerald-100 text-emerald-700",
  },
  need_quotation: {
    label: "Need quotation",
    className: "bg-teal-100 text-teal-700",
  },
  need_followup: {
    label: "Need follow-up",
    className: "bg-amber-100 text-amber-700",
  },
  waiting: { label: "Waiting", className: "bg-sky-100 text-sky-700" },
  decision_pending: {
    label: "Decision pending",
    className: "bg-violet-100 text-violet-700",
  },
  no_response: {
    label: "No response",
    className: "bg-orange-100 text-orange-700",
  },
  ignoring: { label: "Ignoring us", className: "bg-rose-100 text-rose-700" },
  not_interested: {
    label: "Not interested",
    className: "bg-slate-200 text-slate-600",
  },
  won: { label: "Won", className: "bg-emerald-500 text-white" },
  lost: { label: "Lost", className: "bg-rose-500 text-white" },
  // Written by automations, not picked by a person.
  sent: { label: "Sent", className: "bg-emerald-100 text-emerald-700" },
  failed: { label: "Failed", className: "bg-rose-100 text-rose-700" },
  success: { label: "Completed", className: "bg-sky-100 text-sky-700" },
};

export const PICKABLE_OUTCOMES = [
  "interested",
  "need_quotation",
  "need_followup",
  "waiting",
  "decision_pending",
  "no_response",
  "ignoring",
  "not_interested",
  "won",
  "lost",
] as const;

export const TEMPERATURES = [
  { key: "hot", label: "Hot", active: "bg-orange-500 text-white" },
  { key: "warm", label: "Warm", active: "bg-amber-400 text-amber-950" },
  { key: "cold", label: "Cold", active: "bg-sky-300 text-sky-950" },
  { key: "frozen", label: "Frozen", active: "bg-slate-200 text-slate-700" },
  { key: "dead", label: "Dead", active: "bg-zinc-400 text-white" },
  { key: "won", label: "Won", active: "bg-emerald-500 text-white" },
] as const;

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dayDiff(iso: string, now = new Date()) {
  return Math.round(
    (startOfDay(new Date(iso)).getTime() - startOfDay(now).getTime()) /
      86_400_000,
  );
}

/** "Today", "Yesterday", "Monday", "13 Sep", "13 Sep 2025". */
export function dayLabel(iso: string, now = new Date()) {
  const diff = dayDiff(iso, now);
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  const date = new Date(iso);
  if (diff > -7 && diff < 0) {
    return date.toLocaleDateString("en-AU", { weekday: "long" });
  }
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

export function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-AU", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "Today, 11:15 pm", "Tomorrow, 9:00 am", "15 Sep, 2:30 pm". */
export function whenLabel(iso: string, now = new Date()) {
  const diff = dayDiff(iso, now);
  const day =
    diff === 0
      ? "Today"
      : diff === 1
        ? "Tomorrow"
        : diff === -1
          ? "Yesterday"
          : new Date(iso).toLocaleDateString("en-AU", {
              day: "numeric",
              month: "short",
            });
  return `${day}, ${timeLabel(iso)}`;
}

type FollowUpTone = "overdue" | "today" | "soon" | "later";

export function followUpDue(iso: string, now = new Date()) {
  const diff = dayDiff(iso, now);
  if (diff < 0) {
    return { label: `Overdue ${Math.abs(diff)}d`, tone: "overdue" as const };
  }
  if (diff === 0) return { label: "Today", tone: "today" as const };
  if (diff === 1) return { label: "Tomorrow", tone: "soon" as const };
  return {
    label: `${diff} days`,
    tone: diff <= 7 ? ("soon" as const) : ("later" as const),
  };
}

export const FOLLOW_UP_TONE_CLASS: Record<FollowUpTone, string> = {
  overdue: "text-rose-600 font-semibold",
  today: "text-amber-600 font-semibold",
  soon: "text-base-content",
  later: "text-base-content/55",
};

/** The one-line nudge above the rail: what this lead needs from you now. */
export function followUpRecommendation(input: {
  status: string;
  nextActionDue: string | null;
  lastContactAt: string | null;
  now?: Date;
}): { headline: string; className: string } | null {
  const now = input.now ?? new Date();
  if (input.status === "won" || input.status === "lost") return null;
  if (input.nextActionDue) {
    const due = followUpDue(input.nextActionDue, now);
    if (due.tone === "overdue") {
      return {
        headline: `Follow-up ${due.label.toLowerCase()}`,
        className: "border-rose-200 bg-rose-50 text-rose-800",
      };
    }
    if (due.tone === "today") {
      return {
        headline: "Follow-up due today",
        className: "border-amber-200 bg-amber-50 text-amber-800",
      };
    }
  }
  if (!input.lastContactAt) {
    return {
      headline: "No activity logged yet",
      className: "border-sky-200 bg-sky-50 text-sky-800",
    };
  }
  const silent = -dayDiff(input.lastContactAt, now);
  if (silent >= 14) {
    return {
      headline: `Quiet for ${silent} days`,
      className: "border-sky-200 bg-sky-50 text-sky-800",
    };
  }
  if (silent >= 7) {
    return {
      headline: `${silent} days since last contact`,
      className: "border-sky-200 bg-sky-50 text-sky-800",
    };
  }
  return {
    headline:
      silent <= 0 ? "Last contact today" : `Last contact ${silent}d ago`,
    className: "border-base-300 bg-base-200/50 text-base-content/80",
  };
}

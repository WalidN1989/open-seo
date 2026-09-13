import { useEffect, useMemo, useState } from "react";
import { Bot, Plus } from "lucide-react";
import {
  OUTCOME_META,
  dayLabel,
  kindMeta,
  timeLabel,
} from "@/shared/lead-journal";
import type { JournalEntry } from "./journalEntries";

type Props = {
  entries: JournalEntry[];
  onAdd: () => void;
};

function groupByDay(entries: JournalEntry[]) {
  const groups: { label: string; entries: JournalEntry[] }[] = [];
  for (const entry of entries) {
    const label = dayLabel(entry.at);
    const last = groups.at(-1);
    if (last?.label === label) last.entries.push(entry);
    else groups.push({ label, entries: [entry] });
  }
  return groups;
}

export function ActivityJournal({ entries, onAdd }: Props) {
  const [filter, setFilter] = useState<string>("all");

  // "A" opens the dialog from anywhere on the page, as long as nobody is
  // typing into a field.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.key.toLowerCase() !== "a" ||
        event.metaKey ||
        event.ctrlKey ||
        target?.closest("input, textarea, select, [contenteditable]")
      ) {
        return;
      }
      event.preventDefault();
      onAdd();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onAdd]);

  const kinds = useMemo(
    () => [...new Set(entries.map((entry) => entry.kind))],
    [entries],
  );
  const shown =
    filter === "all"
      ? entries
      : entries.filter((entry) => entry.kind === filter);

  return (
    <section className="rounded-xl border border-base-300 bg-base-100">
      <header className="flex items-center gap-2 border-b border-base-300 p-3">
        <h2 className="text-base font-bold">Activity Journal</h2>
        <span className="rounded-full bg-base-200 px-2 py-0.5 text-xs text-base-content/60">
          {entries.length}
        </span>
        <button
          type="button"
          className="btn btn-primary btn-sm ml-auto"
          onClick={onAdd}
        >
          <Plus className="size-4" />
          Add Activity
          <kbd className="kbd kbd-xs bg-primary-content/15 text-primary-content">
            A
          </kbd>
        </button>
      </header>

      {kinds.length > 0 ? (
        <div className="flex flex-wrap gap-1 border-b border-base-300 px-3 py-2">
          {["all", ...kinds].map((kind) => {
            const active = filter === kind;
            const meta = kind === "all" ? null : kindMeta(kind);
            return (
              <button
                key={kind}
                type="button"
                onClick={() => setFilter(active ? "all" : kind)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "bg-primary text-primary-content"
                    : "text-base-content/60 hover:bg-base-200"
                }`}
              >
                {meta ? `${meta.emoji} ${meta.label}` : "All"}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="max-h-[calc(100vh-340px)] min-h-[200px] overflow-y-auto p-3">
        {shown.length === 0 ? (
          <div className="py-12 text-center text-sm text-base-content/50">
            Nothing logged yet. Press <kbd className="kbd kbd-xs">A</kbd> to add
            the first activity.
          </div>
        ) : (
          groupByDay(shown).map((group) => (
            <div key={group.label}>
              <div className="sticky top-0 z-10 bg-base-100/95 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-base-content/50 backdrop-blur">
                {group.label}
              </div>
              {group.entries.map((entry, index) => (
                <JournalItem
                  key={entry.id}
                  entry={entry}
                  last={index === group.entries.length - 1}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function JournalItem({ entry, last }: { entry: JournalEntry; last: boolean }) {
  const meta = kindMeta(entry.kind);
  const outcome = entry.outcome ? OUTCOME_META[entry.outcome] : null;
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className={`grid size-7 shrink-0 place-items-center rounded-full text-sm ${meta.tint}`}
        >
          {meta.emoji}
        </span>
        {last ? null : <span className="w-px flex-1 bg-base-300" />}
      </div>
      <div className="min-w-0 flex-1 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{entry.title}</span>
          {outcome ? (
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${outcome.className}`}
            >
              {outcome.label}
            </span>
          ) : null}
          {entry.automated ? (
            <span
              className="inline-flex items-center gap-0.5 text-[10px] text-base-content/40"
              title="Recorded automatically"
            >
              <Bot className="size-3" />
              auto
            </span>
          ) : null}
          <span className="text-xs text-base-content/45">
            {timeLabel(entry.at)}
          </span>
        </div>
        {entry.body ? (
          <p className="mt-0.5 line-clamp-6 whitespace-pre-wrap text-sm text-base-content/80">
            {entry.body}
          </p>
        ) : null}
      </div>
    </div>
  );
}

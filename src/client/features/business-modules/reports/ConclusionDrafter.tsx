import { useState } from "react";
import { Sparkles } from "lucide-react";

export type ConclusionOptions = {
  tone: "general" | "sales";
  followUpChannel: "email" | "phone" | "whatsapp" | "meeting";
  followUpDays: number;
  followUpNote: string;
};

export type ConclusionDrafterState = {
  run: (options: ConclusionOptions) => void;
  pending: boolean;
  error: string | null;
  redFlags: string[];
};

/**
 * The controls above the conclusion box: what kind of close, and what the
 * follow-up will be, so the last paragraph says exactly what happens next.
 * "General" is filled from a template and costs nothing; "Sales case" sends
 * the whole report and the pictures to the model.
 */
export function ConclusionDrafter({
  drafter,
}: {
  drafter: ConclusionDrafterState;
}) {
  const [options, setOptions] = useState<ConclusionOptions>({
    tone: "general",
    followUpChannel: "email",
    followUpDays: 7,
    followUpNote: "",
  });
  const set = <K extends keyof ConclusionOptions>(
    key: K,
    value: ConclusionOptions[K],
  ) => setOptions((current) => ({ ...current, [key]: value }));
  const select = "select select-bordered select-sm";
  return (
    <div className="space-y-2 rounded-lg border border-base-300 p-3">
      <div className="grid gap-2 md:grid-cols-[auto_auto_auto_minmax(0,1fr)] md:items-end">
        <label className="form-control">
          <span className="label-text text-xs">Kind of close</span>
          <select
            className={select}
            value={options.tone}
            onChange={(event) =>
              set("tone", event.target.value === "sales" ? "sales" : "general")
            }
          >
            <option value="general">General update (no credits)</option>
            <option value="sales">Sales case: gaps and red flags</option>
          </select>
        </label>
        <label className="form-control">
          <span className="label-text text-xs">Follow up</span>
          <select
            className={select}
            value={options.followUpChannel}
            onChange={(event) => {
              const value = event.target.value;
              set(
                "followUpChannel",
                value === "phone" || value === "whatsapp" || value === "meeting"
                  ? value
                  : "email",
              );
            }}
          >
            <option value="email">By email</option>
            <option value="phone">Phone call</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="meeting">Meeting</option>
          </select>
        </label>
        <label className="form-control">
          <span className="label-text text-xs">In (days)</span>
          <input
            className="input input-bordered input-sm w-20"
            inputMode="numeric"
            value={options.followUpDays}
            onChange={(event) =>
              set(
                "followUpDays",
                Math.max(0, Math.min(90, Number(event.target.value) || 0)),
              )
            }
          />
        </label>
        <label className="form-control">
          <span className="label-text text-xs">Follow-up note (optional)</span>
          <input
            className="input input-bordered input-sm w-full"
            placeholder="e.g. to walk through the package options"
            value={options.followUpNote}
            onChange={(event) => set("followUpNote", event.target.value)}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn btn-outline btn-xs"
          disabled={drafter.pending}
          onClick={() => drafter.run(options)}
        >
          <Sparkles className="size-3.5" />
          {drafter.pending ? "Drafting…" : "Draft conclusion"}
        </button>
        <span className="text-xs text-base-content/55">
          {options.tone === "sales"
            ? "Reads the whole report and both pictures, tells the truth, uses credits."
            : "Standard wrap-up from the report's own numbers. Free."}
        </span>
        {drafter.error ? (
          <span className="text-sm text-error">{drafter.error}</span>
        ) : null}
      </div>
      {drafter.redFlags.length ? (
        <div className="text-xs text-base-content/70">
          <p className="font-medium">
            Red flags the model raised, check before sending:
          </p>
          <ul className="list-disc pl-5">
            {drafter.redFlags.map((flag) => (
              <li key={flag}>{flag}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

import { Plus, X } from "lucide-react";

export type CompetitorSuggestion = {
  domain: string;
  keywordsCount: number | null;
  averagePosition: number | null;
  visibility: number | null;
};

function metricLine(suggestion: CompetitorSuggestion) {
  const parts: string[] = [];
  if (suggestion.keywordsCount != null) {
    parts.push(
      `${suggestion.keywordsCount} shared keyword${suggestion.keywordsCount === 1 ? "" : "s"}`,
    );
  }
  if (suggestion.averagePosition != null) {
    parts.push(`avg position ${suggestion.averagePosition.toFixed(1)}`);
  }
  return parts.join(" · ");
}

/**
 * Suggestions, not results. The provider returns whoever shares a results page
 * for these keywords, which routinely includes directories, marketplaces and
 * news sites — so every row is a proposal the operator accepts one at a time,
 * and the panel says so rather than implying the list is already correct.
 */
export function CompetitorSuggestions({
  suggestions,
  keywordsUsed,
  pendingDomain,
  onAdd,
  onDismiss,
}: {
  suggestions: CompetitorSuggestion[];
  keywordsUsed: number;
  pendingDomain: string | null;
  onAdd: (domain: string) => void;
  onDismiss: () => void;
}) {
  return (
    <div className="rounded-lg border border-base-300 bg-base-200/40 p-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs text-base-content/60">
          {suggestions.length === 0
            ? `No new domains competed for your ${keywordsUsed} saved keywords.`
            : `Domains competing for your ${keywordsUsed} saved keywords. Add the ones that are really competitors.`}
        </p>
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={onDismiss}
        >
          <X className="size-3.5" />
          Dismiss
        </button>
      </div>

      {suggestions.length > 0 ? (
        <ul className="mt-2 divide-y divide-base-300">
          {suggestions.map((suggestion) => (
            <li
              key={suggestion.domain}
              className="flex flex-wrap items-center justify-between gap-2 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {suggestion.domain}
                </p>
                <p className="text-xs text-base-content/50">
                  {metricLine(suggestion)}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                disabled={pendingDomain !== null}
                onClick={() => onAdd(suggestion.domain)}
              >
                <Plus className="size-3.5" />
                {pendingDomain === suggestion.domain ? "Adding…" : "Add"}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

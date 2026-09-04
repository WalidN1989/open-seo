import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { draftProjectContextFromSite } from "@/serverFunctions/projectContext";
import {
  PROJECT_CONTEXT_SECTION_KEYS,
  PROJECT_CONTEXT_SECTION_LABELS,
  PROSE_MAX_CHARS,
  type ProjectContextSectionKey,
} from "@/types/schemas/projectContext";
import {
  EmptyState,
  Provenance,
  useContextUpdate,
  type ProjectContextData,
} from "./shared";

const SECTION_HINTS: Record<ProjectContextSectionKey, string> = {
  business_overview: "What you sell, who buys it, and where.",
  current_goal: "What you're pushing for right now, and by when.",
  positioning: "Why someone picks you over the alternatives.",
  writing_preferences: "Voice, words to avoid, topics that are off-limits.",
};

const SECTION_PLACEHOLDERS: Record<ProjectContextSectionKey, string> = {
  business_overview:
    "e.g. Booking software for independent restaurants in the US and Canada. Buyers are owner-operators, not marketers.",
  current_goal:
    "e.g. Double organic signups by Q4. Comparison pages are the current bet.",
  positioning:
    "e.g. The only booking tool that sets up in an afternoon. Cheaper than the incumbents, simpler than the DIY stack.",
  writing_preferences:
    "e.g. Plain and direct, no hype. Never say 'seamless' or 'game-changing'. Don't write about competitor pricing.",
};

export function ProseSections({
  projectId,
  sections,
  missingSections,
}: {
  projectId: string;
  sections: ProjectContextData["sections"];
  missingSections: ProjectContextData["missingSections"];
}) {
  const update = useContextUpdate(projectId);
  const stored = new Map(sections.map((section) => [section.key, section]));
  // Only the fields the user actually touched are pinned locally; the rest
  // render straight from the query, so a write from SAM shows up on refetch.
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});

  const draftOf = (key: ProjectContextSectionKey) =>
    drafts[key] ?? stored.get(key)?.content ?? "";

  // Content is trimmed server-side, so compare trimmed values — otherwise a
  // stray newline leaves the form permanently "unsaved".
  const changed = PROJECT_CONTEXT_SECTION_KEYS.filter(
    (key) => draftOf(key).trim() !== (stored.get(key)?.content ?? ""),
  );

  // The draft lands in the same local state as typing, so it arrives unsaved
  // and "Save changes" lights up. Nothing is stored until the person agrees
  // with it, which keeps a saved section meaning "someone asserted this".
  const draftFromSite = useMutation({
    mutationFn: () => draftProjectContextFromSite({ data: { projectId } }),
    onSuccess: (result) => {
      if (result.status === "no_domain") {
        toast.error("Add a domain on the General tab first.");
        return;
      }
      if (result.status === "unreadable") {
        toast.error(
          result.firecrawlConnected
            ? `Could not read ${result.domain}. Firecrawl returned nothing for it.`
            : `Could not read ${result.domain}. Connect Firecrawl in Integrations to read sites that need a browser.`,
        );
        return;
      }
      setDrafts((current) => ({
        ...current,
        business_overview: result.sections.business_overview,
        positioning: result.sections.positioning,
      }));
      toast.success(
        `Drafted from ${result.pagesRead} page${result.pagesRead === 1 ? "" : "s"}. Read it before saving.`,
      );
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (update.isPending || changed.length === 0) return;
    update.mutate(
      changed.map((key) => ({ section: key, content: draftOf(key).trim() })),
      // Unpin every draft the save made redundant — one that now matches the
      // server — so those sections render from the query again (a pinned
      // draft would silently overwrite a later agent write on the next
      // save). Anything typed while the request was in flight still differs
      // and stays pinned instead of snapping back.
      {
        onSuccess: (context) => {
          const saved = new Map<string, string>(
            context.sections.map((section) => [section.key, section.content]),
          );
          setDrafts((current) =>
            Object.fromEntries(
              Object.entries(current).filter(
                ([key, value]) => value.trim() !== (saved.get(key) ?? ""),
              ),
            ),
          );
        },
      },
    );
  };

  const isEmpty =
    missingSections.length === PROJECT_CONTEXT_SECTION_KEYS.length;

  // One button, placed wherever the eye already is. On an empty form that is
  // the box telling the person to draft from their site — putting the button
  // four textareas below that sentence, next to Save, made it invisible in
  // practice. Once anything is written the box is gone and the footer has it.
  const draftButton = (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      disabled={draftFromSite.isPending}
      onClick={() => draftFromSite.mutate()}
    >
      {draftFromSite.isPending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Sparkles className="size-4" />
      )}
      {draftFromSite.isPending ? "Reading your site…" : "Draft from my site"}
    </button>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {isEmpty ? (
        <EmptyState>
          Nothing written down yet. Draft the overview from your site, then
          write the goal yourself — nothing can infer that one for you.
          <span className="mt-3 block">{draftButton}</span>
        </EmptyState>
      ) : null}

      {PROJECT_CONTEXT_SECTION_KEYS.map((key) => {
        const section = stored.get(key);
        return (
          <div key={key} className="space-y-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <label
                htmlFor={`context-${key}`}
                className="text-sm font-medium text-base-content"
              >
                {PROJECT_CONTEXT_SECTION_LABELS[key]}
              </label>
              {section ? (
                <Provenance by={section.updatedBy} at={section.updatedAt} />
              ) : (
                <span className="text-xs text-base-content/40">Empty</span>
              )}
            </div>
            <p className="text-xs text-base-content/50">{SECTION_HINTS[key]}</p>
            <textarea
              id={`context-${key}`}
              value={draftOf(key)}
              onChange={(event) => {
                const value = event.target.value;
                setDrafts((current) => {
                  // A draft that matches the store is no draft at all — drop
                  // it so an edit typed and then undone doesn't pin the
                  // section against later agent writes.
                  if (value === (stored.get(key)?.content ?? "")) {
                    const { [key]: _dropped, ...rest } = current;
                    return rest;
                  }
                  return { ...current, [key]: value };
                });
              }}
              rows={4}
              maxLength={PROSE_MAX_CHARS}
              placeholder={SECTION_PLACEHOLDERS[key]}
              className="textarea textarea-bordered w-full text-sm"
            />
          </div>
        );
      })}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Empty span keeps Save on the right when the draft button has moved
            up into the empty state. */}
        {isEmpty ? <span /> : draftButton}
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={update.isPending || changed.length === 0}
        >
          Save changes
        </button>
      </div>
    </form>
  );
}

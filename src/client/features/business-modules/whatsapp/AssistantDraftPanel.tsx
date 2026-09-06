import { Globe } from "lucide-react";

/** Offers the draft, and says plainly when there is nothing configured yet. */
export function AssistantDraftPanel({
  empty,
  pending,
  onDraft,
}: {
  empty: boolean;
  pending: boolean;
  onDraft: () => void;
}) {
  return (
    <section
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 ${empty ? "border-primary/40 bg-primary/5" : "border-base-300"}`}
    >
      <div className="flex items-start gap-3 text-sm">
        <Globe className="mt-0.5 size-4 shrink-0" />
        <p>
          {empty ? (
            <>
              <span className="font-medium">Nothing here yet.</span> Draft the
              persona and business facts from what this business has already
              published, then review and save.
            </>
          ) : (
            "Re-draft both boxes from the Context tab or the website. You review before anything is saved."
          )}
        </p>
      </div>
      <button
        type="button"
        className="btn btn-outline btn-sm"
        disabled={pending}
        onClick={() => onDraft()}
      >
        {pending ? "Reading…" : "Draft from my site"}
      </button>
    </section>
  );
}

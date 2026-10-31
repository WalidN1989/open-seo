import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";
import type { startSourceRunSchema } from "@/types/schemas/sources";

function fieldValue(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

type Input = Omit<z.infer<typeof startSourceRunSchema>, "provider">;
export function MapsSearchForm({
  pending,
  onSearch,
}: {
  pending: boolean;
  onSearch: (input: Input) => void;
}) {
  const [mapsUrls, setMapsUrls] = useState("");
  return (
    <form
      className="flex flex-wrap gap-2 rounded-xl border border-base-300 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const q = fieldValue(form, "query");
        if (q.length < 2) {
          toast.error("Describe what you are looking for.");
          return;
        }
        onSearch({
          query: q,
          mapsUrls: mapsUrls.trim()
            ? mapsUrls.split(/\s+/).filter(Boolean)
            : undefined,
          limit: Number(form.get("limit")),
          location: fieldValue(form, "location") || undefined,
        });
      }}
    >
      <input
        name="query"
        className="input input-bordered input-sm min-w-0 flex-1"
        aria-label="Business search"
        placeholder="Painters, plumbers, electricians…"
      />
      <input
        name="location"
        className="input input-bordered input-sm min-w-0 flex-1"
        aria-label="Search location"
        defaultValue="Brisbane, Australia"
        placeholder="Brisbane, Australia"
      />
      <label className="flex items-center gap-2 text-sm">
        Limit{" "}
        <input
          name="limit"
          aria-label="Maximum results"
          type="number"
          min={1}
          max={100}
          defaultValue={25}
          className="input input-sm input-bordered w-20"
        />
      </label>
      <button className="btn btn-primary btn-sm" disabled={pending}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Search className="size-4" />
        )}
        Search Google Maps
      </button>
      <details className="w-full">
        <summary className="cursor-pointer text-sm text-base-content/65">
          Use specific Google Maps links instead
        </summary>
        <textarea
          aria-label="Google Maps links"
          className="textarea textarea-bordered mt-2 w-full"
          placeholder="Paste up to 20 Google Maps URLs, one per line"
          value={mapsUrls}
          onChange={(event) => setMapsUrls(event.target.value)}
        />
        <p className="text-xs text-base-content/50">
          Enter a search label above to identify this batch. Links replace the
          search term and location.
        </p>
      </details>
      <p className="w-full text-xs text-base-content/50">
        Uses your connected Apify account. Each search may use Apify credits.
        Results stay in Prospects until you convert them.
      </p>
    </form>
  );
}

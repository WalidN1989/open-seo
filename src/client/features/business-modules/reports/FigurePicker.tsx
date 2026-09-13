import { useState } from "react";

/** A screenshot, not a photo library: two megabytes is plenty. */
const MAX_FIGURE_BYTES = 2_000_000;

/**
 * One picture slot: choose a file, see a thumbnail, remove it, caption it.
 * The report has two of these under "Where you stand": the client's own
 * profile card, and the map or local pack showing who else appears.
 */
export function FigurePicker({
  label,
  hint,
  image,
  caption,
  onImage,
  onCaption,
}: {
  label: string;
  hint: string;
  image: string;
  caption: string;
  onImage: (dataUrl: string) => void;
  onCaption: (caption: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2 rounded-lg border border-base-300 p-3">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="file-input file-input-bordered file-input-sm"
          aria-label={label}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            if (file.size > MAX_FIGURE_BYTES) {
              setError("That image is over 2 MB. Crop or compress it.");
              return;
            }
            const reader = new FileReader();
            reader.addEventListener("load", () => {
              // readAsDataURL always yields a string; anything else is a
              // read that did not happen.
              if (typeof reader.result !== "string") return;
              setError(null);
              onImage(reader.result);
            });
            reader.readAsDataURL(file);
          }}
        />
        {image ? (
          <>
            <img
              src={image}
              alt=""
              className="h-12 rounded border border-base-300 object-cover"
            />
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => onImage("")}
            >
              Remove
            </button>
          </>
        ) : null}
      </div>
      {error ? <p className="text-sm text-error">{error}</p> : null}
      <input
        className="input input-bordered input-sm w-full"
        value={caption}
        onChange={(event) => onCaption(event.target.value)}
        placeholder="Caption"
        aria-label={`${label} caption`}
      />
      <p className="text-xs text-base-content/55">{hint}</p>
    </div>
  );
}

import { useEffect, useState } from "react";
/**
 * What is running for this client that the database cannot see.
 *
 * A tag on their site, a listing on Google Maps, a Facebook page somebody
 * else runs — none of that leaves a row anywhere, so the person generating
 * the report says. Everything here lands on the report exactly as ticked.
 */
export type Engagement = {
  googleBusinessProfile: boolean;
  googleReviews: boolean;
  whatsappAssistant: boolean;
  sitemap: boolean;
  tagManager: boolean;
  emailMarketing: boolean;
  facebookUrl: string;
  facebookManaged: boolean;
  instagramUrl: string;
  instagramManaged: boolean;
  googleReviewUrl: string;
  recommendations: string;
  conclusion: string;
  standingIntro: string;
  figureImage: string;
  figureCaption: string;
};

export const EMPTY_ENGAGEMENT: Engagement = {
  googleBusinessProfile: false,
  googleReviews: false,
  whatsappAssistant: false,
  sitemap: false,
  tagManager: false,
  emailMarketing: false,
  facebookUrl: "",
  facebookManaged: false,
  instagramUrl: "",
  instagramManaged: false,
  googleReviewUrl: "",
  recommendations: "",
  conclusion: "",
  standingIntro: "",
  figureImage: "",
  figureCaption: "",
};

/** A screenshot, not a photo library: two megabytes is plenty. */
const MAX_FIGURE_BYTES = 2_000_000;

type ToggleKey = {
  [K in keyof Engagement]: Engagement[K] extends boolean ? K : never;
}[keyof Engagement];

const TOGGLES: Array<{ key: ToggleKey; label: string }> = [
  { key: "sitemap", label: "XML sitemap submitted" },
  { key: "tagManager", label: "Google Tag Manager installed" },
  { key: "googleBusinessProfile", label: "Google Business Profile" },
  { key: "googleReviews", label: "Google review collection" },
  { key: "whatsappAssistant", label: "WhatsApp assistant and automation" },
  { key: "emailMarketing", label: "Email marketing" },
];

function Toggle({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  children: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        className="checkbox checkbox-sm"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {children}
    </label>
  );
}

function SocialRow({
  label,
  url,
  managed,
  onUrl,
  onManaged,
}: {
  label: string;
  url: string;
  managed: boolean;
  onUrl: (next: string) => void;
  onManaged: (next: boolean) => void;
}) {
  return (
    <div className="grid gap-2 md:grid-cols-[7rem_minmax(0,1fr)_auto] md:items-center">
      <span className="text-sm">{label}</span>
      <input
        className="input input-bordered input-sm"
        value={url}
        onChange={(event) => onUrl(event.target.value)}
        placeholder={`https://${label.toLowerCase()}.com/theirbusiness`}
        aria-label={`${label} page address`}
      />
      <Toggle checked={managed} onChange={onManaged}>
        We manage it
      </Toggle>
    </div>
  );
}

export function EngagementForm({
  value,
  onChange,
}: {
  value: Engagement;
  onChange: (next: Engagement) => void;
}) {
  const set = <K extends keyof Engagement>(key: K, next: Engagement[K]) =>
    onChange({ ...value, [key]: next });
  // The tick opens the box; clearing the box on untick is what makes the
  // tick mean something, since an empty conclusion is left off the report.
  const [showConclusion, setShowConclusion] = useState(
    Boolean(value.conclusion),
  );
  const [figureError, setFigureError] = useState<string | null>(null);
  useEffect(() => {
    if (value.conclusion) setShowConclusion(true);
  }, [value.conclusion]);

  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="label-text mb-1">
          Also running for this client
        </legend>
        <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {TOGGLES.map((toggle) => (
            <Toggle
              key={toggle.key}
              checked={value[toggle.key]}
              onChange={(next) => set(toggle.key, next)}
            >
              {toggle.label}
            </Toggle>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="label-text mb-1">Social profiles</legend>
        <SocialRow
          label="Facebook"
          url={value.facebookUrl}
          managed={value.facebookManaged}
          onUrl={(next) => set("facebookUrl", next)}
          onManaged={(next) => set("facebookManaged", next)}
        />
        <SocialRow
          label="Instagram"
          url={value.instagramUrl}
          managed={value.instagramManaged}
          onUrl={(next) => set("instagramUrl", next)}
          onManaged={(next) => set("instagramManaged", next)}
        />
        <p className="text-xs text-base-content/55">
          A profile with an address shows on the report, marked as managed by us
          or not. Leave it blank and it is left out.
        </p>
      </fieldset>

      <label className="form-control">
        <span className="label-text">Google review link (optional)</span>
        <input
          className="input input-bordered input-sm"
          value={value.googleReviewUrl}
          onChange={(event) => set("googleReviewUrl", event.target.value)}
          placeholder="https://g.page/r/…/review"
        />
        <span className="label-text-alt mt-1 block text-base-content/55">
          Adds a section with WhatsApp, email and Facebook share links, so the
          client can ask customers for reviews in one tap.
        </span>
      </label>

      <fieldset className="space-y-2">
        <legend className="label-text mb-1">
          Where you stand — the picture that makes the gap felt
        </legend>
        <input
          className="input input-bordered input-sm w-full"
          value={value.standingIntro}
          onChange={(event) => set("standingIntro", event.target.value)}
          placeholder="One or two sentences, e.g. On Google you are visible in Springfield Lakes, but nearby firms own far more review trust."
          aria-label="Where you stand, intro"
        />
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="file-input file-input-bordered file-input-sm"
            aria-label="Screenshot"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              if (file.size > MAX_FIGURE_BYTES) {
                setFigureError("That image is over 2 MB. Crop or compress it.");
                return;
              }
              const reader = new FileReader();
              reader.addEventListener("load", () => {
                // readAsDataURL always yields a string; anything else is a
                // read that did not happen.
                if (typeof reader.result !== "string") return;
                setFigureError(null);
                set("figureImage", reader.result);
              });
              reader.readAsDataURL(file);
            }}
          />
          {value.figureImage ? (
            <>
              <img
                src={value.figureImage}
                alt=""
                className="h-12 rounded border border-base-300 object-cover"
              />
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => set("figureImage", "")}
              >
                Remove
              </button>
            </>
          ) : null}
        </div>
        {figureError ? (
          <p className="text-sm text-error">{figureError}</p>
        ) : null}
        <input
          className="input input-bordered input-sm w-full"
          value={value.figureCaption}
          onChange={(event) => set("figureCaption", event.target.value)}
          placeholder="Caption, e.g. You: 5.0★ from 5 reviews. Deduct Tax: 4.9★ from 147. Same area, much bigger proof gap."
          aria-label="Caption"
        />
        <p className="text-xs text-base-content/55">
          Usually a screenshot of Google&rsquo;s local pack for their main
          search. It prints full width under &ldquo;Where you stand&rdquo;,
          before the numbers.
        </p>
      </fieldset>

      <div className="space-y-2">
        <Toggle
          checked={showConclusion}
          onChange={(next) => {
            setShowConclusion(next);
            if (!next) set("conclusion", "");
          }}
        >
          Include a conclusion (for a client who has been with us a while)
        </Toggle>
        {showConclusion ? (
          <label className="form-control">
            <textarea
              className="textarea textarea-bordered min-h-40"
              value={value.conclusion}
              onChange={(event) => set("conclusion", event.target.value)}
              placeholder="Paste the read on the account. **Bold** and lines starting with - are kept."
            />
          </label>
        ) : null}
      </div>

      <label className="form-control">
        <span className="label-text">Our recommendations (optional)</span>
        <textarea
          className="textarea textarea-bordered min-h-28"
          value={value.recommendations}
          onChange={(event) => set("recommendations", event.target.value)}
          placeholder="What they should do next, in your words. Blank lines start a new paragraph."
        />
      </label>
    </div>
  );
}

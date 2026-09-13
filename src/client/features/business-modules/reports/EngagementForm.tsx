import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { FigurePicker } from "./FigurePicker";
import {
  ConclusionDrafter,
  type ConclusionDrafterState,
} from "./ConclusionDrafter";
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
  figureImage2: string;
  figureCaption2: string;
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
  figureImage2: "",
  figureCaption2: "",
};

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

export type FigureReader = {
  run: () => void;
  pending: boolean;
  error: string | null;
  seen: string[];
};

export function EngagementForm({
  value,
  onChange,
  figureReader,
  conclusionDrafter,
}: {
  value: Engagement;
  onChange: (next: Engagement) => void;
  /** Reads the uploaded screenshot into the intro and caption; optional. */
  figureReader?: FigureReader;
  /** Drafts the conclusion from the report's data; optional. */
  conclusionDrafter?: ConclusionDrafterState;
}) {
  const set = <K extends keyof Engagement>(key: K, next: Engagement[K]) =>
    onChange({ ...value, [key]: next });
  // The tick opens the box; clearing the box on untick is what makes the
  // tick mean something, since an empty conclusion is left off the report.
  const [showConclusion, setShowConclusion] = useState(
    Boolean(value.conclusion),
  );
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
        <div className="grid gap-3 md:grid-cols-2">
          <FigurePicker
            label="Picture 1: their own profile"
            hint="Their Business Profile card, or their spot in the results."
            image={value.figureImage}
            caption={value.figureCaption}
            onImage={(next) => set("figureImage", next)}
            onCaption={(next) => set("figureCaption", next)}
          />
          <FigurePicker
            label="Picture 2: who else shows up"
            hint="The map or local pack for their main search, competitors visible."
            image={value.figureImage2}
            caption={value.figureCaption2}
            onImage={(next) => set("figureImage2", next)}
            onCaption={(next) => set("figureCaption2", next)}
          />
        </div>
        {figureReader && (value.figureImage || value.figureImage2) ? (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn btn-outline btn-xs"
              disabled={figureReader.pending}
              onClick={figureReader.run}
              title="Claude reads the pictures and drafts the intro, captions and pitch lines from a sales angle. You can edit everything after."
            >
              <Sparkles className="size-3.5" />
              {figureReader.pending ? "Reading…" : "Draft from screenshots"}
            </button>
            {figureReader.error ? (
              <span className="text-sm text-error">{figureReader.error}</span>
            ) : null}
          </div>
        ) : null}
        {figureReader?.seen.length ? (
          <p className="text-xs text-base-content/55">
            Read from the pictures: {figureReader.seen.join(" · ")}. Check these
            before you generate.
          </p>
        ) : null}
        <p className="text-xs text-base-content/55">
          Both print side by side under &ldquo;Where you stand&rdquo;, before
          the numbers, each no taller than half a page.
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
        {showConclusion && conclusionDrafter ? (
          <ConclusionDrafter drafter={conclusionDrafter} />
        ) : null}
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

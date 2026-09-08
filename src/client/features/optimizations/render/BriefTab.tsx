import { readBriefLinks, readStringList, readText, type Json } from "./read";

function Chips({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "include" | "avoid";
}) {
  if (!items.length) return null;
  return (
    <section>
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={item}
            className={`badge badge-sm ${tone === "avoid" ? "badge-ghost line-through opacity-70" : "badge-ghost"}`}
          >
            {item}
          </span>
        ))}
      </div>
    </section>
  );
}

export function BriefTab({ brief }: { brief: Json }) {
  const h1 = readText(brief, "h1", "H1", "heading");
  const angle = readText(brief, "angle", "positioning");
  const outline = readStringList(brief, "outline", "sections");
  const include = readStringList(
    brief,
    "mustIncludePhrases",
    "must_include_phrases",
    "include",
  );
  const avoid = readStringList(
    brief,
    "phrasesToAvoid",
    "phrases_to_avoid",
    "avoid",
  );
  const links = readBriefLinks(brief);
  const schema = readText(brief, "schemaNotes", "schema_notes", "schema");

  const empty =
    !h1 &&
    !angle &&
    !outline.length &&
    !include.length &&
    !avoid.length &&
    !links.length &&
    !schema;

  if (empty) {
    return (
      <p className="py-8 text-center text-sm text-base-content/50">
        No brief yet. The assistant writes this before drafting.
      </p>
    );
  }

  return (
    <div className="space-y-7">
      {h1 ? (
        <section>
          <h3 className="text-sm font-semibold">Page heading</h3>
          <p className="mt-1 text-lg font-medium">{h1}</p>
        </section>
      ) : null}

      {angle ? (
        <section>
          <h3 className="text-sm font-semibold">The angle</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-base-content/80">
            {angle}
          </p>
        </section>
      ) : null}

      {outline.length ? (
        <section>
          <h3 className="text-sm font-semibold">Outline</h3>
          <ol className="mt-2 space-y-2">
            {outline.map((item, index) => (
              <li key={index} className="flex gap-3 text-sm">
                <span className="w-5 shrink-0 text-right tabular-nums text-base-content/40">
                  {index + 1}
                </span>
                <span className="text-base-content/80">{item}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <Chips title="Phrases to include" items={include} tone="include" />
      <Chips title="Phrases to avoid" items={avoid} tone="avoid" />

      {links.length ? (
        <section>
          <h3 className="text-sm font-semibold">Internal links</h3>
          <ul className="mt-2 space-y-1.5">
            {links.map((link, index) => (
              <li key={index} className="text-sm">
                <span className="font-medium">{link.anchor}</span>
                {link.url ? (
                  <span className="text-base-content/50"> → {link.url}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {schema ? (
        <section>
          <h3 className="text-sm font-semibold">Structured data notes</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-base-content/80">
            {schema}
          </p>
        </section>
      ) : null}
    </div>
  );
}

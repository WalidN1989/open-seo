/**
 * Working out which project someone means from what they said out loud.
 *
 * Nothing about a spoken project name is reliable. "Bestrends" arrives from
 * the transcriber as "best trends", "Best Trends" or — as its own owner kept
 * saying it — "best friends". So names are compared as run-together letters
 * with doubled letters collapsed, and a near miss still counts when nothing
 * matches exactly.
 *
 * Done here, deterministically, rather than asked of the model: which
 * project's data gets loaded into an answer is not something to leave to a
 * guess the model makes in passing.
 */

export type VoiceProject = { id: string; name: string; domain: string | null };

/** Lowercase letters and digits only, with doubled letters collapsed. */
function compact(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/(.)\1+/g, "$1");
}

/** "bestrends.lk" -> "bestrends"; "www.digitalurgency.com.au" -> "digitalurgency". */
function domainLabel(domain: string | null) {
  if (!domain) return "";
  const host = domain
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
  return host?.split(".")[0] ?? "";
}

function keysFor(project: VoiceProject) {
  return [compact(project.name), compact(domainLabel(project.domain))].filter(
    (key) => key.length >= 4,
  );
}

function distance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      row[j] =
        a[i - 1] === b[j - 1]
          ? previous
          : 1 + Math.min(previous, row[j], row[j - 1]);
      previous = current;
    }
  }
  return row[b.length];
}

/**
 * Whether a key appears in what was said, exactly or within a letter or two
 * for every six. Windows of the utterance a little shorter and longer than
 * the key are tried, because a transcriber adds and drops letters.
 */
function mentions(said: string, key: string) {
  if (said.includes(key)) return true;
  const allowed = Math.max(1, Math.floor(key.length / 6) + 1);
  for (
    let width = key.length - allowed;
    width <= key.length + allowed;
    width += 1
  ) {
    if (width < 4) continue;
    for (let start = 0; start + width <= said.length; start += 1) {
      if (distance(said.slice(start, start + width), key) <= allowed)
        return true;
    }
  }
  return false;
}

/**
 * The project this conversation is about, or null when it still has to ask.
 *
 * Someone with one project is never asked — there is only one it could be.
 * Otherwise the most recent thing they said that names a project wins, so
 * "now look at Bookshop Near Me" moves the conversation on.
 */
export function resolveProject(
  projects: VoiceProject[],
  userTurns: string[],
): VoiceProject | null {
  if (projects.length === 1) return projects[0] ?? null;
  for (const turn of userTurns.toReversed()) {
    const said = compact(turn);
    const named = projects.filter((project) =>
      keysFor(project).some((key) => mentions(said, key)),
    );
    // Two projects both "heard" in one sentence is ambiguity, not an answer.
    if (named.length === 1) return named[0] ?? null;
  }
  return null;
}
